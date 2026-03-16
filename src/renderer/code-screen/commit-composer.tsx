import { useEffect, useState } from 'react';

import { GitCommitHorizontalIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';
import { Textarea } from '@/shadcn/components/ui/textarea';

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
    }
  };

  return (
    <div className="border-t border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-foreground">
          Commit {selectedFileCount} of {totalFileCount} {totalFileCount === 1 ? 'file' : 'files'}
        </div>
      </div>

      {error ? (
        <Alert className="mb-3">
          <AlertTitle>Commit failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="Commit summary"
          rows={2}
          disabled={isSubmitting}
        />
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description (optional)"
          rows={4}
          disabled={isSubmitting}
        />
        <Button
          type="button"
          onClick={() => void handleCommit()}
          disabled={
            isSubmitting ||
            selectedFileCount === 0 ||
            summary.trim().length === 0
          }
        >
          <GitCommitHorizontalIcon data-icon="inline-start" />
          {isSubmitting ? 'Committing…' : 'Commit selected changes'}
        </Button>
      </div>
    </div>
  );
}
