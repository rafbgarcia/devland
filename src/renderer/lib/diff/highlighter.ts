// eslint-disable-next-line import/default
import HighlighterWorker from '@/renderer/lib/diff/highlighter.worker?worker';

import type {
  DiffContentPair,
  DiffContentSource,
  DiffHighlightRequest,
  DiffHighlightResponse,
  DiffHighlightTokens,
  DiffLineFilters,
} from '@/lib/diff';
import { getDiffLineFilters, MAX_HIGHLIGHT_CONTENT_BYTES } from '@/lib/diff';
import type { DiffFile } from '@/lib/diff/types';

const highlightWorkers: Worker[] = [];
const MAX_IDLING_WORKERS = 2;
const WORKER_TIMEOUT_MS = 5_000;

export type DiffFileContents = {
  pair: DiffContentPair;
  oldContents: string[];
  newContents: string[];
};

export type DiffFileTokens = {
  oldTokens: DiffHighlightTokens;
  newTokens: DiffHighlightTokens;
};

function buildFallbackContentLines(
  file: DiffFile,
  side: 'old' | 'new',
  requestedLines: ReadonlyArray<number>,
) {
  if (requestedLines.length === 0) {
    return [] as string[];
  }

  const contentLines = Array.from({ length: Math.max(...requestedLines) + 1 }, () => '');

  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      const lineNumber = side === 'old' ? line.oldLineNumber : line.newLineNumber;

      if (lineNumber === null) {
        continue;
      }

      contentLines[lineNumber - 1] = line.content;
    }
  }

  return contentLines;
}

async function loadContentSource(
  source: DiffContentSource,
  maxBytes = MAX_HIGHLIGHT_CONTENT_BYTES,
): Promise<string[]> {
  switch (source.type) {
    case 'none':
      return [];
    case 'git': {
      const content = await window.electronAPI.getGitBlobText({
        repoPath: source.repoPath,
        revision: source.revision,
        filePath: source.path,
        maxBytes,
      });

      return content?.split(/\r?\n/) ?? [];
    }
    case 'working-tree': {
      const content = await window.electronAPI.getWorkingTreeFileText({
        repoPath: source.repoPath,
        filePath: source.path,
        maxBytes,
      });

      return content?.split(/\r?\n/) ?? [];
    }
  }
}

export async function loadDiffFileContents(pair: DiffContentPair): Promise<DiffFileContents> {
  const [oldContents, newContents] = await Promise.all([
    loadContentSource(pair.oldSource),
    loadContentSource(pair.newSource),
  ]);

  return { pair, oldContents, newContents };
}

function requestHighlight(request: DiffHighlightRequest): Promise<DiffHighlightResponse> {
  if (request.contentLines.length === 0 || request.lines?.length === 0) {
    return Promise.resolve({});
  }

  const worker = highlightWorkers.shift() ?? new HighlighterWorker();

  return new Promise<DiffHighlightResponse>((resolve, reject) => {
    let timeoutId: number | null = null;

    const clearWorkerTimeout = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    worker.onerror = (event) => {
      clearWorkerTimeout();
      worker.terminate();
      reject(event.error ?? new Error(event.message));
    };

    worker.onmessage = (event: MessageEvent<DiffHighlightResponse>) => {
      clearWorkerTimeout();

      if (highlightWorkers.length < MAX_IDLING_WORKERS) {
        highlightWorkers.push(worker);
      } else {
        worker.terminate();
      }

      resolve(event.data);
    };

    worker.postMessage(request);

    timeoutId = window.setTimeout(() => {
      worker.terminate();
      reject(new Error('Syntax highlighter timed out.'));
    }, WORKER_TIMEOUT_MS);
  });
}

function getPreferredPath(pair: DiffContentPair) {
  switch (pair.newSource.type) {
    case 'git':
    case 'working-tree':
      return pair.newSource.path;
    default:
      return pair.oldSource.type === 'git' ? pair.oldSource.path : pair.displayPath;
  }
}

export async function highlightDiffFileContents(
  pair: DiffContentPair,
  file: DiffFile,
  tabSize = 2,
  contents?: DiffFileContents,
): Promise<DiffFileTokens> {
  const resolvedContents = contents ?? (await loadDiffFileContents(pair));
  const filters: DiffLineFilters = getDiffLineFilters(file.hunks);
  const preferredPath = getPreferredPath(pair);
  const basename = preferredPath.split(/[\\/]/).at(-1) ?? preferredPath;
  const extensionMatch = /\.[^.]+$/.exec(preferredPath);
  const extension = extensionMatch?.[0] ?? '';
  const oldContentLines =
    resolvedContents.oldContents.length > 0
      ? resolvedContents.oldContents
      : buildFallbackContentLines(file, 'old', filters.oldLineFilter);
  const newContentLines =
    resolvedContents.newContents.length > 0
      ? resolvedContents.newContents
      : buildFallbackContentLines(file, 'new', filters.newLineFilter);

  const [oldTokens, newTokens] = await Promise.all([
    requestHighlight({
      basename,
      extension,
      contentLines: oldContentLines,
      tabSize,
      lines: filters.oldLineFilter,
      addModeClass: true,
    }).catch((error: unknown) => {
      console.error(`Failed to load old-side syntax tokens for ${preferredPath}:`, error);
      return {};
    }),
    requestHighlight({
      basename,
      extension,
      contentLines: newContentLines,
      tabSize,
      lines: filters.newLineFilter,
      addModeClass: true,
    }).catch((error: unknown) => {
      console.error(`Failed to load new-side syntax tokens for ${preferredPath}:`, error);
      return {};
    }),
  ]);

  return { oldTokens, newTokens };
}
