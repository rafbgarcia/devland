import { useEffect, useState } from 'react';

import { GitCommitHorizontalIcon, LoaderCircleIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';

export function CommitComposer({
  selectedFileCount,
  totalFileCount,
  isSubmitting,
  error,
  onCommit,
}: {
  selectedFileCount: number;
  totalFileCount: number;
  isSubmitting: boolean;
  error: string | null;
  onCommit: (draft: { summary: string; description: string }) => Promise<boolean>;
}) {
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [showDescription, setShowDescription] = useState(false);

  useEffect(() => {
    if (selectedFileCount === 0) {
      setSummary('');
      setDescription('');
    }
  }, [selectedFileCount]);

  const handleCommit = async () => {
    const didCommit = await onCommit({ summary, description });

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
