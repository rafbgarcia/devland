import { memo, useMemo, useState } from 'react';
import { FileIcon, FolderIcon } from 'lucide-react';

import { getVscodeIconUrlForEntry } from '@/renderer/shared/lib/vscode-icons';
import { cn } from '@/shadcn/lib/utils';

export const VscodeEntryIcon = memo(function VscodeEntryIcon({
  className,
  kind,
  pathValue,
  theme,
}: {
  className?: string;
  kind: 'file' | 'directory';
  pathValue: string;
  theme: 'light' | 'dark';
}) {
  const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null);
  const iconUrl = useMemo(
    () => getVscodeIconUrlForEntry(pathValue, kind, theme),
    [kind, pathValue, theme],
  );
  const failed = failedIconUrl === iconUrl;

  if (failed) {
    return kind === 'directory' ? (
      <FolderIcon className={cn('size-4 text-muted-foreground/80', className)} />
    ) : (
      <FileIcon className={cn('size-4 text-muted-foreground/80', className)} />
    );
  }

  return (
    <img
      src={iconUrl}
      alt=""
      aria-hidden="true"
      className={cn('size-4 shrink-0', className)}
      loading="lazy"
      onError={() => {
        setFailedIconUrl(iconUrl);
      }}
    />
  );
});
