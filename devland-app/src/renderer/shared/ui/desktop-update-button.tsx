import { useEffect, useState } from 'react';
import { ArrowUpIcon, DownloadIcon, RefreshCwIcon } from 'lucide-react';

import type { DesktopUpdateState } from '@/ipc/contracts';
import {
  getDesktopUpdateActionError,
  getDesktopUpdateButtonLabel,
  getDesktopUpdateButtonTooltip,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
  shouldShowDesktopUpdateButton,
} from '@/renderer/shared/lib/desktop-update';
import { Button } from '@/shadcn/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shadcn/components/ui/tooltip';
import { cn } from '@/shadcn/lib/utils';

export function DesktopUpdateButton({
  state,
}: {
  state: DesktopUpdateState | null;
}) {
  const [lastActionError, setLastActionError] = useState<string | null>(null);

  useEffect(() => {
    setLastActionError(null);
  }, [state?.status, state?.availableVersion, state?.downloadedVersion]);

  if (!shouldShowDesktopUpdateButton(state) || state === null) {
    return null;
  }

  const action = resolveDesktopUpdateButtonAction(state);
  const disabled = isDesktopUpdateButtonDisabled(state);
  const tooltip = lastActionError ?? getDesktopUpdateButtonTooltip(state);

  const handleClick = async () => {
    if (disabled || action === 'none') {
      return;
    }

    if (action === 'download') {
      const result = await window.electronAPI.downloadUpdate();
      setLastActionError(getDesktopUpdateActionError(result));
      return;
    }

    const result = await window.electronAPI.installUpdate();
    setLastActionError(getDesktopUpdateActionError(result));
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className={cn(
            'border border-border/70 bg-background/80 text-muted-foreground backdrop-blur-sm',
            state.status === 'available' && 'text-amber-700 hover:text-amber-800',
            state.status === 'downloading' && 'text-sky-700 hover:text-sky-800',
            state.status === 'downloaded' && 'text-emerald-700 hover:text-emerald-800',
          )}
          disabled={disabled}
          onClick={() => {
            void handleClick();
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {state.status === 'available' && <DownloadIcon className="size-3.5" />}
          {state.status === 'downloading' && <RefreshCwIcon className="size-3.5 animate-spin" />}
          {state.status === 'downloaded' && <ArrowUpIcon className="size-3.5" />}
          <span>{getDesktopUpdateButtonLabel(state)}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
