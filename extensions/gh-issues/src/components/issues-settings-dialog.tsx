import { useState } from 'react';

import { Dialog } from '@base-ui/react/dialog';
import { SettingsIcon } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DEFAULT_CODEX_PROMPT, useCodexPrompt } from '@/hooks/use-codex-prompt';

export function IssuesSettingsButton({ slug }: { slug: string }) {
  const [prompt, setPrompt] = useCodexPrompt();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(prompt);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (isOpen) setDraft(prompt);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Dialog.Trigger
            render={
              <button
                type="button"
                className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              />
            }
          >
            <SettingsIcon className="size-3" />
          </Dialog.Trigger>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-6 shadow-xl">
          <Dialog.Title className="text-sm font-semibold text-foreground">
            Issues Settings
          </Dialog.Title>

          <div className="mt-4">
            <label className="text-xs font-medium text-muted-foreground">
              Codex investigation prompt
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground/70">
              Sent to Codex when you click "Investigate with Codex". The issue reference is appended automatically.
            </p>
            <div className="mt-2 w-full rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
              <textarea
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                  }
                }}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                className="w-full resize-none overflow-hidden bg-transparent px-3 pt-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <p className="border-t px-3 py-1.5 text-xs text-muted-foreground select-none">
                Issue: {slug}#<code className="text-[0.65rem]">{'{{issue}}'}</code>
              </p>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={() => {
                setPrompt(draft.trim().length > 0 ? draft.trim() : DEFAULT_CODEX_PROMPT);
                setOpen(false);
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Save
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
