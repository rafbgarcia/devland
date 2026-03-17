import {
  memo,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import {
  CheckIcon,
  ImagePlusIcon,
  LoaderCircleIcon,
  PlusIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SquareIcon,
  XIcon,
  ZapIcon,
} from 'lucide-react';

import {
  CODEX_IMAGE_ATTACHMENT_MAX_BYTES,
  CODEX_IMAGE_ATTACHMENT_MAX_BYTES_LABEL,
  CODEX_IMAGE_ATTACHMENTS_MAX_COUNT,
  CODEX_INTERACTION_MODE_LABEL,
  CODEX_MODEL_OPTIONS,
  CODEX_REASONING_EFFORTS,
  codexFastModeLabel,
  type CodexComposerSettings,
  type CodexPromptSubmission,
  codexReasoningEffortLabel,
  codexRuntimeModeLabel,
} from '@/lib/codex-chat';
import type { CodexChatMessage } from '@/renderer/code-screen/codex-session-state';
import { SessionHistoryDropdown } from '@/renderer/code-screen/session-history-dropdown';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIndicator,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import { cn } from '@/shadcn/lib/utils';

type ComposerImageAttachment = {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl: string;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Could not read image data.'));
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Failed to read image.'));
    });
    reader.readAsDataURL(file);
  });
}

function revokeComposerAttachmentPreviews(attachments: readonly ComposerImageAttachment[]) {
  for (const attachment of attachments) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}

function SettingsDropdown({
  settings,
  onChange,
}: {
  settings: CodexComposerSettings;
  onChange: (settings: CodexComposerSettings) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Composer settings"
      >
        <SettingsIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" sideOffset={8} align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Select model</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={settings.model}
            onValueChange={(model) => {
              if (!model || model === settings.model) {
                return;
              }

              onChange({
                ...settings,
                model,
              });
            }}
          >
            {CODEX_MODEL_OPTIONS.map((modelOption) => (
              <DropdownMenuRadioItem
                key={modelOption.value}
                value={modelOption.value}
                closeOnClick={false}
              >
                <ZapIcon className="size-3.5 text-amber-400" />
                {modelOption.label}
                <DropdownMenuRadioItemIndicator className="ml-auto">
                  <CheckIcon className="size-3.5" />
                </DropdownMenuRadioItemIndicator>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>Select reasoning</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={settings.reasoningEffort}
            onValueChange={(reasoningEffort) => {
              if (!reasoningEffort || reasoningEffort === settings.reasoningEffort) {
                return;
              }

              onChange({
                ...settings,
                reasoningEffort: reasoningEffort as CodexComposerSettings['reasoningEffort'],
              });
            }}
          >
            {CODEX_REASONING_EFFORTS.map((effort) => (
              <DropdownMenuRadioItem key={effort} value={effort} closeOnClick={false}>
                {codexReasoningEffortLabel(effort)}
                <DropdownMenuRadioItemIndicator className="ml-auto">
                  <CheckIcon className="size-3.5" />
                </DropdownMenuRadioItemIndicator>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>Fast mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={settings.fastMode ? 'on' : 'off'}
            onValueChange={(value) => {
              onChange({
                ...settings,
                fastMode: value === 'on',
              });
            }}
          >
            {['off', 'on'].map((value) => (
              <DropdownMenuRadioItem key={value} value={value} closeOnClick={false}>
                {value}
                <DropdownMenuRadioItemIndicator className="ml-auto">
                  <CheckIcon className="size-3.5" />
                </DropdownMenuRadioItemIndicator>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>Access</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={settings.runtimeMode}
            onValueChange={(runtimeMode) => {
              if (!runtimeMode || runtimeMode === settings.runtimeMode) {
                return;
              }

              onChange({
                ...settings,
                runtimeMode: runtimeMode as CodexComposerSettings['runtimeMode'],
              });
            }}
          >
            <DropdownMenuRadioItem value="approval-required" closeOnClick={false}>
              <ShieldCheckIcon className="size-3.5" />
              Supervised
              <DropdownMenuRadioItemIndicator className="ml-auto">
                <CheckIcon className="size-3.5" />
              </DropdownMenuRadioItemIndicator>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="full-access" closeOnClick={false}>
              <ShieldCheckIcon className="size-3.5" />
              Full access
              <DropdownMenuRadioItemIndicator className="ml-auto">
                <CheckIcon className="size-3.5" />
              </DropdownMenuRadioItemIndicator>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const ChatComposer = memo(function ChatComposer({
  settings,
  isRunning,
  messages,
  onSettingsChange,
  onNewSession,
  onSendPrompt,
  onInterrupt,
}: {
  settings: CodexComposerSettings;
  isRunning: boolean;
  messages: CodexChatMessage[];
  onSettingsChange: (settings: CodexComposerSettings) => void;
  onNewSession: () => void;
  onSendPrompt: (submission: CodexPromptSubmission) => Promise<void>;
  onInterrupt: () => Promise<void>;
}) {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<ComposerImageAttachment[]>([]);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const dragDepthRef = useRef(0);
  const attachmentsRef = useRef<ComposerImageAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputId = useId();

  const hasHistory = messages.length > 0;
  const isInputDisabled = isRunning || isSending;
  const placeholder = `Message ${CODEX_INTERACTION_MODE_LABEL} (${codexReasoningEffortLabel(settings.reasoningEffort)}, ${codexFastModeLabel(settings.fastMode)}, ${codexRuntimeModeLabel(settings.runtimeMode)})`;

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(
    () => () => {
      revokeComposerAttachmentPreviews(attachmentsRef.current);
    },
    [],
  );

  const appendAttachments = (files: readonly File[]) => {
    const nextAttachments: ComposerImageAttachment[] = [];
    let nextImageCount = attachmentsRef.current.length;
    let error: string | null = null;

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        error = `Unsupported file type for '${file.name}'. Please attach image files only.`;
        continue;
      }

      if (file.size > CODEX_IMAGE_ATTACHMENT_MAX_BYTES) {
        error = `'${file.name}' exceeds the ${CODEX_IMAGE_ATTACHMENT_MAX_BYTES_LABEL} attachment limit.`;
        continue;
      }

      if (nextImageCount >= CODEX_IMAGE_ATTACHMENTS_MAX_COUNT) {
        error = `You can attach up to ${CODEX_IMAGE_ATTACHMENTS_MAX_COUNT} images per message.`;
        break;
      }

      nextAttachments.push({
        id: crypto.randomUUID(),
        file,
        name: file.name || 'image',
        mimeType: file.type,
        sizeBytes: file.size,
        previewUrl: URL.createObjectURL(file),
      });
      nextImageCount += 1;
    }

    if (nextAttachments.length > 0) {
      setAttachments((current) => [...current, ...nextAttachments]);
      setComposerNotice(null);
    } else if (error) {
      setComposerNotice(error);
    }
  };

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length > 0) {
      appendAttachments(files);
    }

    event.target.value = '';
  };

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (isSending || isRunning) {
      return;
    }

    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt && attachments.length === 0) {
      return;
    }

    const pendingPrompt = prompt;
    const pendingAttachments = attachments;

    setIsSending(true);
    setPrompt('');
    setAttachments([]);
    setComposerNotice(null);

    try {
      const nextAttachments = await Promise.all(
        pendingAttachments.map(async (attachment) => ({
          type: 'image' as const,
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          dataUrl: await readFileAsDataUrl(attachment.file),
        })),
      );

      await onSendPrompt({
        prompt: trimmedPrompt,
        settings,
        attachments: nextAttachments,
      });
      revokeComposerAttachmentPreviews(pendingAttachments);
    } catch (error) {
      setPrompt(pendingPrompt);
      setAttachments(pendingAttachments);
      setComposerNotice('Failed to send prompt.');
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

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    appendAttachments(imageFiles);
  };

  const handleDragEnter = (event: DragEvent<HTMLFormElement>) => {
    if (!event.dataTransfer.types.includes('Files')) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (!event.dataTransfer.types.includes('Files')) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLFormElement>) => {
    if (!event.dataTransfer.types.includes('Files')) {
      return;
    }

    event.preventDefault();
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLFormElement>) => {
    if (!event.dataTransfer.types.includes('Files')) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    appendAttachments(Array.from(event.dataTransfer.files));
    textareaRef.current?.focus();
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setAttachments((current) => {
      const attachment = current.find((candidate) => candidate.id === attachmentId);

      if (attachment) {
        URL.revokeObjectURL(attachment.previewUrl);
      }

      return current.filter((candidate) => candidate.id !== attachmentId);
    });
  };

  return (
    <div className="w-full">
      <div className="flex items-end gap-2">
        <div className="flex shrink-0 items-center gap-0.5 pb-1">
          <SessionHistoryDropdown messages={messages} disabled={!hasHistory} />
          <SettingsDropdown settings={settings} onChange={onSettingsChange} />
          <button
            type="button"
            onClick={onNewSession}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="New session"
          >
            <PlusIcon className="size-4" />
          </button>
        </div>

        <form
          className={cn(
            'flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20',
            isDragOver && 'border-primary/70 bg-primary/5',
          )}
          onSubmit={handleSubmit}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="relative overflow-hidden rounded-xl border border-border/80 bg-background"
                >
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.name}
                    className="size-16 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(attachment.id)}
                    className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground transition-colors hover:bg-background"
                    aria-label={`Remove ${attachment.name}`}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFilesSelected}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isInputDisabled}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              aria-label="Attach images"
            >
              <ImagePlusIcon className="size-4" />
            </button>

            <textarea
              ref={textareaRef}
              className="field-sizing-content min-h-[1.5rem] flex-1 resize-none overflow-y-auto border-0 bg-transparent text-sm leading-normal text-foreground outline-none placeholder:text-muted-foreground/50"
              placeholder={placeholder}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={isInputDisabled}
              rows={1}
            />
          </div>
        </form>

        {isRunning ? (
          <div className="shrink-0 pb-1">
            <button
              type="button"
              onClick={() => void onInterrupt()}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label="Stop"
            >
              <SquareIcon className="size-3.5 fill-current" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-1 px-0.5 text-[10px] text-muted-foreground/40">
        {isRunning ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground/60">
            <LoaderCircleIcon className="size-2.5 animate-spin" />
            Working...
          </span>
        ) : composerNotice ? (
          <span className="text-destructive/80">{composerNotice}</span>
        ) : (
          <span>
            ↵ send · shift+↵ newline · paste, drop, or choose images
            {attachments.length > 0 ? ` · ${attachments.length}/${CODEX_IMAGE_ATTACHMENTS_MAX_COUNT} attached` : ''}
          </span>
        )}
      </div>
    </div>
  );
});
