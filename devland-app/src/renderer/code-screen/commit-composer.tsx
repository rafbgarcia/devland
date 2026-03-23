import { useEffect, useState } from 'react';

import { GitCommitHorizontalIcon, LoaderCircleIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';

export function CommitComposer({
  selectedFileCount,
  totalFileCount,
  isSubmitting,
  error,
  codexContext,
  onCommit,
}: {
  selectedFileCount: number;
  totalFileCount: number;
  isSubmitting: boolean;
  error: string | null;
  codexContext?: {
    enabled: boolean;
    reason: string | null;
  };
  onCommit: (draft: {
    summary: string;
    description: string;
    includeCodexContext: boolean;
  }) => Promise<boolean>;
}) {
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const [includeCodexContext, setIncludeCodexContext] = useState(true);

  useEffect(() => {
    if (selectedFileCount === 0) {
      setSummary('');
      setDescription('');
    }
  }, [selectedFileCount]);

  useEffect(() => {
    if (codexContext && !codexContext.enabled) {
      setIncludeCodexContext(false);
    }
  }, [codexContext]);

  const handleCommit = async () => {
    const didCommit = await onCommit({ summary, description, includeCodexContext });

    if (didCommit) {
      setSummary('');
      setDescription('');
      setShowDescription(false);
    }
  };

  const canCommit = !isSubmitting && selectedFileCount > 0 && summary.trim().length > 0;

  return (
    <div className="border-t border-border p-2.5">
      {error ? (
        <div className="mb-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <input
        type="text"
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && canCommit) {
            void handleCommit();
          }
        }}
        placeholder={
          selectedFileCount > 0
            ? `Summary (${selectedFileCount} of ${totalFileCount} files)`
            : 'Select files to commit'
        }
        disabled={isSubmitting || selectedFileCount === 0}
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-ring focus:ring-1 focus:ring-ring/30 disabled:opacity-50"
      />

      {showDescription ? (
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description (optional)"
          rows={3}
          disabled={isSubmitting}
          className="mt-1.5 w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-ring focus:ring-1 focus:ring-ring/30 disabled:opacity-50"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowDescription(true)}
          className="mt-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Add description
        </button>
      )}

      {codexContext ? (
        <label className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={codexContext.enabled ? includeCodexContext : false}
            onChange={(event) => setIncludeCodexContext(event.target.checked)}
            disabled={isSubmitting || !codexContext.enabled}
            className="mt-0.5 size-3.5 rounded border border-border bg-background accent-primary disabled:opacity-50"
          />
          <span className="flex-1">
            <span className="block font-medium text-foreground/80">Include Codex session snapshot</span>
          </span>
        </label>
      ) : null}

      <Button
        type="button"
        size="sm"
        className="mt-2 w-full"
        onClick={() => void handleCommit()}
        disabled={!canCommit}
      >
        {isSubmitting ? (
          <LoaderCircleIcon className="size-3.5 animate-spin" data-icon="inline-start" />
        ) : (
          <GitCommitHorizontalIcon data-icon="inline-start" />
        )}
        {isSubmitting
          ? 'Committing...'
          : selectedFileCount > 0
            ? `Commit ${selectedFileCount} file${selectedFileCount === 1 ? '' : 's'}`
            : 'Commit'}
      </Button>
    </div>
  );
}
