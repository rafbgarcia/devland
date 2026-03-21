import { PuzzleIcon } from 'lucide-react';
import { DynamicIcon } from 'lucide-react/dynamic';

import { resolveExtensionIconName } from '@/renderer/shared/lib/extension-icons';
import { cn } from '@/shadcn/lib/utils';

export function ExtensionTabIcon({
  className,
  iconName,
}: {
  className?: string;
  iconName: string;
}) {
  return (
    <DynamicIcon
      name={resolveExtensionIconName(iconName)}
      className={cn('shrink-0', className)}
      fallback={() => <PuzzleIcon className={cn('shrink-0', className)} />}
    />
  );
}
