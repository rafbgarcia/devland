import { useCallback, useEffect, useMemo, useState } from 'react';
import { type DiffFile } from '@devlandapp/diff-viewer';

import type {
  CodexSessionStatus,
  CommitWorkingTreeSelectionFile,
} from '@/ipc/contracts';
import type { CodexComposerSettings } from '@/lib/codex-chat';
import { buildGitPromptRequestSnapshot } from '@/renderer/code-screen/prompt-request-snapshot';
import type { CodexSessionState } from '@/renderer/code-screen/codex-session-state';
import { commitWorkingTreeSelectionAndRefresh } from '@/renderer/code-screen/working-tree-commit';

function getStagePaths(file: DiffFile) {
  return [...new Set([file.oldPath, file.newPath].filter((path): path is string => path !== null))];
}

export type WorkingTreeCommitSelectionState = {
  isSubmitting: boolean;
  error: string | null;
  selectedFileCount: number;
  isFileSelected: (path: string) => boolean;
  toggleFileSelection: (path: string, nextSelected: boolean) => void;
  commitSelection: (draft: {
    summary: string;
    description: string;
    includeCodexContext: boolean;
  }) => Promise<boolean>;
};

export function useWorkingTreeCommitSelection({
  repoPath,
  branchName,
  diffFiles,
  enabled,
  codexContext,
}: {
  repoPath: string;
  branchName: string;
  diffFiles: readonly DiffFile[];
  enabled: boolean;
  codexContext?: {
    status: CodexSessionStatus;
    threadId: string | null;
    transcriptEntries: CodexSessionState['transcriptEntries'];
    model: CodexComposerSettings['model'];
    reasoningEffort: CodexComposerSettings['reasoningEffort'];
  } | null;
}): WorkingTreeCommitSelectionState {
  const [selectionByPath, setSelectionByPath] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSelectionByPath({});
      setError(null);
      setIsSubmitting(false);
      return;
    }

    setSelectionByPath((current) =>
      Object.fromEntries(
        diffFiles.map((file) => {
          const previous = current[file.displayPath];
          return [file.displayPath, previous ?? true];
        }),
      ),
    );
  }, [diffFiles, enabled]);

  const isFileSelected = useCallback(
    (path: string) => selectionByPath[path] ?? false,
    [selectionByPath],
  );

  const toggleFileSelection = useCallback((path: string, nextSelected: boolean) => {
    setSelectionByPath((current) => {
      if (!(path in current)) {
        return current;
      }

      return {
        ...current,
        [path]: nextSelected,
      };
    });
    setError(null);
  }, []);

  const selectedFileCount = useMemo(
    () => diffFiles.filter((file) => selectionByPath[file.displayPath] ?? false).length,
    [diffFiles, selectionByPath],
  );

  const commitSelection = useCallback(async (
    draft: { summary: string; description: string; includeCodexContext: boolean },
  ) => {
    const summary = draft.summary.trim();

    if (!enabled || summary.length === 0 || isSubmitting) {
      return false;
    }

    const files: CommitWorkingTreeSelectionFile[] = diffFiles.flatMap((file) => {
      if (!(selectionByPath[file.displayPath] ?? false)) {
        return [];
      }

      return [{
        path: file.displayPath,
        paths: getStagePaths(file),
      }];
    });

    if (files.length === 0) {
      setError('Select at least one change to commit.');
      return false;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let snapshot = null;
      let noteWarning: string | null = null;

      if (
        draft.includeCodexContext &&
        codexContext?.threadId &&
        codexContext.status !== 'running'
      ) {
        try {
          snapshot = buildGitPromptRequestSnapshot({
            sessionState: {
              threadId: codexContext.threadId,
              transcriptEntries: codexContext.transcriptEntries,
            },
            settings: {
              model: codexContext.model,
              reasoningEffort: codexContext.reasoningEffort,
            },
            branchName,
            checkpoint: await window.electronAPI.getCodexPromptRequestCheckpoint({
              repoPath,
              threadId: codexContext.threadId,
            }),
          });
        } catch (checkpointError) {
          noteWarning =
            checkpointError instanceof Error
              ? `Commit succeeded, but failed to prepare Codex context: ${checkpointError.message}`
              : 'Commit succeeded, but failed to prepare Codex context.';
        }
      }

      const result = await commitWorkingTreeSelectionAndRefresh({
        repoPath,
        summary,
        description: draft.description.trim(),
        files,
      });

      if (snapshot && codexContext?.threadId) {
        try {
          await window.electronAPI.writeGitPromptRequestNote({
            repoPath,
            commitSha: result.commitSha,
            threadId: codexContext.threadId,
            transcriptEntryCount: snapshot.checkpoint.transcriptEntryEnd,
            snapshot,
          });
        } catch (noteError) {
          noteWarning =
            noteError instanceof Error
              ? `Commit succeeded, but failed to attach Codex context: ${noteError.message}`
              : 'Commit succeeded, but failed to attach Codex context.';
        }
      }

      if (noteWarning !== null) {
        setError(noteWarning);
      }
      return true;
    } catch (commitError) {
      setError(
        commitError instanceof Error
          ? commitError.message
          : 'Failed to commit the selected changes.',
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [branchName, codexContext, diffFiles, enabled, isSubmitting, repoPath, selectionByPath]);

  return {
    isSubmitting,
    error,
    selectedFileCount,
    isFileSelected,
    toggleFileSelection,
    commitSelection,
  };
}
