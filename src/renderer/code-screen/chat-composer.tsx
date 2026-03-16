import { memo, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';

import {
  CheckIcon,
  HistoryIcon,
  LoaderCircleIcon,
  SettingsIcon,
  ShieldCheckIcon,
  XIcon,
  ZapIcon,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuCheckboxItemIndicator,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIndicator,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';

function SettingsDropdown() {
  const [model, setModel] = useState('gpt-5.4');
  const [effort, setEffort] = useState('high');
  const [fullAccess, setFullAccess] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <SettingsIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" sideOffset={8} align="start">
        <DropdownMenuLabel>Select model</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={model} onValueChange={setModel}>
          {[
            { value: 'gpt-5.4', label: 'GPT-5.4' },
            { value: 'gpt-5.3-codex', label: 'GPT-5.3-Codex' },
            { value: 'gpt-5.3-codex-spark', label: 'GPT-5.3-Codex-Spark' },
            { value: 'gpt-5.2-codex', label: 'GPT-5.2-Codex' },
            { value: 'gpt-5.2', label: 'GPT-5.2' },
          ].map((modelOption) => (
            <DropdownMenuRadioItem key={modelOption.value} value={modelOption.value} closeOnClick={false}>
              <ZapIcon className="size-3.5 text-amber-400" />
              {modelOption.label}
              <DropdownMenuRadioItemIndicator className="ml-auto">
                <CheckIcon className="size-3.5" />
              </DropdownMenuRadioItemIndicator>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Select reasoning</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={effort} onValueChange={setEffort}>
          {['Low', 'Medium', 'High', 'Extra High'].map((level) => (
            <DropdownMenuRadioItem key={level} value={level.toLowerCase()} closeOnClick={false}>
              {level}
              <DropdownMenuRadioItemIndicator className="ml-auto">
                <CheckIcon className="size-3.5" />
              </DropdownMenuRadioItemIndicator>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuCheckboxItem
          checked={fullAccess}
          onCheckedChange={setFullAccess}
          closeOnClick={false}
        >
          <ShieldCheckIcon className="size-3.5" />
          Full access
          <DropdownMenuCheckboxItemIndicator className="ml-auto">
            <CheckIcon className="size-3.5" />
          </DropdownMenuCheckboxItemIndicator>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const ChatComposer = memo(function ChatComposer({
  targetLabel,
  isRunning,
  onSendPrompt,
  onInterrupt,
}: {
  targetLabel: string;
  isRunning: boolean;
  onSendPrompt: (prompt: string) => Promise<void>;
  onInterrupt: () => Promise<void>;
}) {
  const [prompt, setPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt || isSending || isRunning) {
      return;
    }

    setIsSending(true);
    setPrompt('');

    try {
      await onSendPrompt(trimmedPrompt);
    } catch (error) {
      setPrompt(trimmedPrompt);
      console.error('Failed to send prompt:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const isInputDisabled = isRunning || isSending;

  return (
    <div className="w-full">
      <form
        className="flex items-end gap-1 rounded-xl border border-border bg-muted/30 px-1.5 py-1.5 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20"
        onSubmit={handleSubmit}
      >
        <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Session history"
          >
            <HistoryIcon className="size-4" />
          </button>
          <SettingsDropdown />
        </div>

        <textarea
          className="max-h-32 min-h-[2rem] flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-normal text-foreground outline-none placeholder:text-muted-foreground/60"
          placeholder={`Message Codex about ${targetLabel}`}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isInputDisabled}
          rows={1}
          style={{ fieldSizing: 'content' } as CSSProperties}
        />

        {isRunning ? (
          <div className="shrink-0 pb-0.5">
            <button
              type="button"
              onClick={() => void onInterrupt()}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label="Stop"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        ) : null}
      </form>

      <div className="mt-1 px-1 text-[10px] text-muted-foreground/50">
        {isRunning ? (
          <span className="inline-flex items-center gap-1">
            <LoaderCircleIcon className="size-3 animate-spin" />
            Codex is working...
          </span>
        ) : (
          '↵ to send · shift+↵ for newline'
        )}
      </div>
    </div>
  );
});
