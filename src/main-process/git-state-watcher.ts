import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  existsSync,
  readdirSync,
  watch,
  type Dirent,
  type FSWatcher,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const GIT_WATCH_DEBOUNCE_MS = 120;

type GitStateWatcherChangeEvent = {
  repoPath: string;
};

type WatchEntry = {
  kind: 'root' | 'refs';
  watcher: FSWatcher;
};

type WatchedRepo = {
  repoPath: string;
  refsRoots: string[];
  watchers: Map<string, WatchEntry>;
  subscriptionCount: number;
  debounceTimer: NodeJS.Timeout | null;
  isSyncingRefs: boolean;
  hasPendingRefsSync: boolean;
  isDisposed: boolean;
};

const getGitExecOptions = () => ({
  timeout: 8000,
  windowsHide: true,
});

const listDirectoriesRecursively = (rootPath: string): string[] => {
  if (!existsSync(rootPath)) {
    return [];
  }

  const directories: string[] = [];
  const pending = [rootPath];

  while (pending.length > 0) {
    const currentPath = pending.pop();

    if (!currentPath || !existsSync(currentPath)) {
      continue;
    }

    directories.push(currentPath);

    let entries: Dirent[];

    try {
      entries = readdirSync(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      pending.push(path.join(currentPath, entry.name));
    }
  }

  return directories;
};

const resolveGitMetadataPaths = async (
  repoPath: string,
): Promise<{ gitDir: string; gitCommonDir: string }> => {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', repoPath, 'rev-parse', '--git-dir', '--git-common-dir'],
    getGitExecOptions(),
  );

  const [gitDirRaw = '', gitCommonDirRaw = ''] = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!gitDirRaw || !gitCommonDirRaw) {
    throw new Error('Could not resolve Git metadata paths for this repository.');
  }

  return {
    gitDir: path.resolve(repoPath, gitDirRaw),
    gitCommonDir: path.resolve(repoPath, gitCommonDirRaw),
  };
};

class GitStateWatcher extends EventEmitter<{
  changed: [GitStateWatcherChangeEvent];
}> {
  private readonly watchedRepos = new Map<string, WatchedRepo>();

  private readonly subscriptions = new Map<string, string>();

  async subscribe(repoPath: string): Promise<string> {
    const normalizedRepoPath = path.normalize(repoPath);
    let watchedRepo = this.watchedRepos.get(normalizedRepoPath);

    if (!watchedRepo) {
      watchedRepo = await this.createWatchedRepo(normalizedRepoPath);
      this.watchedRepos.set(normalizedRepoPath, watchedRepo);
    }

    watchedRepo.subscriptionCount += 1;

    const subscriptionId = randomUUID();
    this.subscriptions.set(subscriptionId, normalizedRepoPath);

    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): void {
    const repoPath = this.subscriptions.get(subscriptionId);

    if (!repoPath) {
      return;
    }

    this.subscriptions.delete(subscriptionId);

    const watchedRepo = this.watchedRepos.get(repoPath);

    if (!watchedRepo) {
      return;
    }

    watchedRepo.subscriptionCount = Math.max(0, watchedRepo.subscriptionCount - 1);

    if (watchedRepo.subscriptionCount > 0) {
      return;
    }

    this.disposeWatchedRepo(watchedRepo);
    this.watchedRepos.delete(repoPath);
  }

  private async createWatchedRepo(repoPath: string): Promise<WatchedRepo> {
    const { gitDir, gitCommonDir } = await resolveGitMetadataPaths(repoPath);
    const rootPaths = [...new Set([gitDir, gitCommonDir])];

    const watchedRepo: WatchedRepo = {
      repoPath,
      refsRoots: rootPaths.map((rootPath) => path.join(rootPath, 'refs')),
      watchers: new Map(),
      subscriptionCount: 0,
      debounceTimer: null,
      isSyncingRefs: false,
      hasPendingRefsSync: false,
      isDisposed: false,
    };

    for (const rootPath of rootPaths) {
      this.addWatch(watchedRepo, rootPath, 'root');
    }

    await this.syncRefDirectoryWatchers(watchedRepo);

    return watchedRepo;
  }

  private addWatch(
    watchedRepo: WatchedRepo,
    watchPath: string,
    kind: WatchEntry['kind'],
  ): void {
    if (watchedRepo.isDisposed || watchedRepo.watchers.has(watchPath) || !existsSync(watchPath)) {
      return;
    }

    try {
      const watcher = watch(
        watchPath,
        { persistent: false },
        () => {
          if (watchedRepo.isDisposed) {
            return;
          }

          void this.syncRefDirectoryWatchers(watchedRepo);
          this.scheduleEmit(watchedRepo);
        },
      );

      watcher.on('error', () => {
        if (watchedRepo.isDisposed) {
          return;
        }

        this.removeWatch(watchedRepo, watchPath);
        void this.syncRefDirectoryWatchers(watchedRepo);
        this.scheduleEmit(watchedRepo);
      });

      watchedRepo.watchers.set(watchPath, { kind, watcher });
    } catch (error) {
      const systemError = error as NodeJS.ErrnoException;

      if (systemError.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private removeWatch(watchedRepo: WatchedRepo, watchPath: string): void {
    const entry = watchedRepo.watchers.get(watchPath);

    if (!entry) {
      return;
    }

    entry.watcher.close();
    watchedRepo.watchers.delete(watchPath);
  }

  private async syncRefDirectoryWatchers(watchedRepo: WatchedRepo): Promise<void> {
    if (watchedRepo.isDisposed) {
      return;
    }

    if (watchedRepo.isSyncingRefs) {
      watchedRepo.hasPendingRefsSync = true;
      return;
    }

    watchedRepo.isSyncingRefs = true;

    try {
      do {
        watchedRepo.hasPendingRefsSync = false;
        const nextRefDirectories = new Set(
          watchedRepo.refsRoots.flatMap((refsRoot) =>
            listDirectoriesRecursively(refsRoot),
          ),
        );

        if (watchedRepo.isDisposed) {
          return;
        }

        for (const [watchPath, entry] of watchedRepo.watchers.entries()) {
          if (entry.kind !== 'refs' || nextRefDirectories.has(watchPath)) {
            continue;
          }

          this.removeWatch(watchedRepo, watchPath);
        }

        for (const refDirectory of nextRefDirectories) {
          this.addWatch(watchedRepo, refDirectory, 'refs');
        }
      } while (watchedRepo.hasPendingRefsSync);
    } finally {
      watchedRepo.isSyncingRefs = false;
    }
  }

  private scheduleEmit(watchedRepo: WatchedRepo): void {
    if (watchedRepo.isDisposed) {
      return;
    }

    if (watchedRepo.debounceTimer !== null) {
      clearTimeout(watchedRepo.debounceTimer);
    }

    watchedRepo.debounceTimer = setTimeout(() => {
      if (watchedRepo.isDisposed) {
        return;
      }

      watchedRepo.debounceTimer = null;
      this.emit('changed', { repoPath: watchedRepo.repoPath });
    }, GIT_WATCH_DEBOUNCE_MS);
  }

  private disposeWatchedRepo(watchedRepo: WatchedRepo): void {
    watchedRepo.isDisposed = true;

    if (watchedRepo.debounceTimer !== null) {
      clearTimeout(watchedRepo.debounceTimer);
      watchedRepo.debounceTimer = null;
    }

    for (const entry of watchedRepo.watchers.values()) {
      entry.watcher.close();
    }

    watchedRepo.watchers.clear();
  }
}

export const gitStateWatcher = new GitStateWatcher();
