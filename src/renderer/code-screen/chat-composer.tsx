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
import type { CodexPathSearchResultItem } from '@/ipc/contracts';
import type { CodexChatMessage } from '@/renderer/code-screen/codex-session-state';
import {
  areComposerTagTriggersEqual,
  detectComposerTagTrigger,
  replaceTextRange,
  type ComposerTagTrigger,
} from '@/renderer/code-screen/chat-composer-tags';
import {
  createComposerImageAttachment,
  type ComposerImageAttachment,
} from '@/renderer/code-screen/chat-composer-attachments';
import { SessionHistoryDropdown } from '@/renderer/code-screen/session-history-dropdown';
import { VscodeEntryIcon } from '@/renderer/shared/ui/vscode-entry-icon';
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/shadcn/components/ui/dialog';
import { cn } from '@/shadcn/lib/utils';

const TAG_SEARCH_DEBOUNCE_MS = 120;
const TAG_SEARCH_LIMIT = 40;

function getComposerTagIconTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') {
    return 'dark';
  }

  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function basenameOfPath(value: string): string {
  const separatorIndex = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
  return separatorIndex === -1 ? value : value.slice(separatorIndex + 1);
}

function getPathSuggestionLabel(item: CodexPathSearchResultItem): string {
  return item.scope === 'global' ? `${item.repoLabel}/${item.relativePath}` : item.relativePath;
}

function extendReplacementRangeForTrailingSpace(
  value: string,
  rangeEnd: number,
  replacement: string,
): number {
  if (!replacement.endsWith(' ') || value[rangeEnd] !== ' ') {
    return rangeEnd;
  }

  return rangeEnd + 1;
}

function PathSuggestionMenu({
  items,
  activeIndex,
  isLoading,
  onHighlight,
  query,
  onSelect,
}: {
  items: CodexPathSearchResultItem[];
  activeIndex: number;
  isLoading: boolean;
  query: string;
  onHighlight: (index: number) => void;
  onSelect: (item: CodexPathSearchResultItem) => void;
}) {
  const iconTheme = getComposerTagIconTheme();

  return (
    <div className="absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-xl border border-border/80 bg-popover/96 shadow-lg ring-1 ring-foreground/8 backdrop-blur-xs">
      <div className="max-h-80 overflow-y-auto p-1.5">
        {items.map((item, index) => {
          const label = getPathSuggestionLabel(item);
          const fileName = basenameOfPath(label);
          const prefix = label.slice(0, Math.max(0, label.length - fileName.length));

          return (
            <button
              key={`${item.scope}:${item.absolutePath}`}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onMouseEnter={() => onHighlight(index)}
              onClick={() => onSelect(item)}
              className={cn(
                'flex w-full items-center gap-3 p-1.5 transition-colors rounded',
                index === activeIndex ? 'bg-accent/65 text-accent-foreground' : 'hover:bg-accent/40',
              )}
            >
              <VscodeEntryIcon
                className="size-4"
                kind="file"
                pathValue={item.relativePath}
                theme={iconTheme}
              />
              <span className="text-sm truncate">
                <span className="text-muted-foreground/80">{prefix}</span>
                <span className="text-foreground">{fileName}</span>
              </span>
            </button>
          );
        })}

        {!isLoading && items.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No matching files for <span className="font-medium text-foreground">{query}</span>.
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <LoaderCircleIcon className="size-3 animate-spin" />
            Searching files...
          </div>
        ) : null}
      </div>
    </div>
  );
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
  activeRepoPath,
  storedRepoPaths,
  settings,
  isRunning,
  messages,
  onSettingsChange,
  onNewSession,
  onSendPrompt,
  onInterrupt,
}: {
  activeRepoPath: string;
  storedRepoPaths: string[];
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
  const [openAttachmentId, setOpenAttachmentId] = useState<string | null>(null);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [tagTrigger, setTagTrigger] = useState<ComposerTagTrigger | null>(null);
  const [tagSuggestions, setTagSuggestions] = useState<CodexPathSearchResultItem[]>([]);
  const [activeTagSuggestionIndex, setActiveTagSuggestionIndex] = useState(0);
  const [isTagSearchLoading, setIsTagSearchLoading] = useState(false);
  const dragDepthRef = useRef(0);
  const attachmentsRef = useRef<ComposerImageAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputId = useId();

  const hasHistory = messages.length > 0;
  const isInputDisabled = isRunning || isSending;
  const placeholder = `Message ${CODEX_INTERACTION_MODE_LABEL} (${codexReasoningEffortLabel(settings.reasoningEffort)}, ${codexFastModeLabel(settings.fastMode)}, ${codexRuntimeModeLabel(settings.runtimeMode)})`;
  const tagMenuQuery = tagTrigger?.query.trim() ?? '';
  const isTagMenuOpen = tagTrigger !== null && tagMenuQuery.length > 0;
  const openAttachment =
    openAttachmentId === null
      ? null
      : attachments.find((attachment) => attachment.id === openAttachmentId) ?? null;

  const setResolvedTagTrigger = (nextTrigger: ComposerTagTrigger | null) => {
    setTagTrigger((currentTrigger) =>
      areComposerTagTriggersEqual(currentTrigger, nextTrigger) ? currentTrigger : nextTrigger,
    );
  };

  useEffect(() => {
    if (!isTagMenuOpen || tagTrigger === null) {
      setTagSuggestions([]);
      setActiveTagSuggestionIndex(0);
      setIsTagSearchLoading(false);
      return;
    }

    let cancelled = false;
    setIsTagSearchLoading(true);

    const timeoutId = window.setTimeout(() => {
      void window.electronAPI
        .searchCodexPaths({
          cwd: activeRepoPath,
          scope: tagTrigger.scope,
          query: tagMenuQuery,
          limit: TAG_SEARCH_LIMIT,
          storedRepoPaths,
        })
        .then((result) => {
          if (cancelled) {
            return;
          }

          setTagSuggestions(result.items);
          setActiveTagSuggestionIndex(0);
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          console.error('Failed to search Codex paths:', error);
          setTagSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) {
            setIsTagSearchLoading(false);
          }
        });
    }, TAG_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeRepoPath, isTagMenuOpen, storedRepoPaths, tagMenuQuery, tagTrigger]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const appendAttachments = async (files: readonly File[]) => {
    const acceptedFiles: File[] = [];
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

      acceptedFiles.push(file);
      nextImageCount += 1;
    }

    if (acceptedFiles.length > 0) {
      try {
        const nextAttachments = await Promise.all(
          acceptedFiles.map((file) => createComposerImageAttachment(file)),
        );

        setAttachments((current) => [...current, ...nextAttachments]);
      } catch (readError) {
        setComposerNotice('Failed to read image.');
        console.error('Failed to prepare composer attachments:', readError);
        return;
      }

      setComposerNotice(null);
    } else if (error) {
      setComposerNotice(error);
    }
  };

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length > 0) {
      void appendAttachments(files);
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
    setOpenAttachmentId(null);
    setTagTrigger(null);
    setTagSuggestions([]);
    setComposerNotice(null);

    try {
      const nextAttachments = await Promise.all(
        pendingAttachments.map(async (attachment) => ({
          type: 'image' as const,
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          dataUrl: attachment.dataUrl,
        })),
      );

      await onSendPrompt({
        prompt: trimmedPrompt,
        settings,
        attachments: nextAttachments,
      });
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
    if (isTagMenuOpen && tagTrigger !== null) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveTagSuggestionIndex((current) =>
          tagSuggestions.length === 0 ? 0 : (current + 1) % tagSuggestions.length,
        );
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveTagSuggestionIndex((current) =>
          tagSuggestions.length === 0
            ? 0
            : (current - 1 + tagSuggestions.length) % tagSuggestions.length,
        );
        return;
      }

      if ((event.key === 'Enter' || event.key === 'Tab') && tagSuggestions.length > 0) {
        event.preventDefault();
        const candidate = tagSuggestions[activeTagSuggestionIndex] ?? tagSuggestions[0];

        if (candidate) {
          const replacement = `@${candidate.scope === 'current' ? candidate.relativePath : candidate.absolutePath} `;
          const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
            prompt,
            tagTrigger.rangeEnd,
            replacement,
          );
          const nextState = replaceTextRange(
            prompt,
            tagTrigger.rangeStart,
            replacementRangeEnd,
            replacement,
          );

          setPrompt(nextState.value);
          setTagTrigger(null);
          setTagSuggestions([]);
          setActiveTagSuggestionIndex(0);

          window.requestAnimationFrame(() => {
            textareaRef.current?.focus();
            textareaRef.current?.setSelectionRange(nextState.cursor, nextState.cursor);
          });
        }

        return;
      }
    }

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
    void appendAttachments(imageFiles);
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
    void appendAttachments(Array.from(event.dataTransfer.files));
    textareaRef.current?.focus();
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    if (attachmentId === openAttachmentId) {
      setOpenAttachmentId(null);
    }

    setAttachments((current) => current.filter((candidate) => candidate.id !== attachmentId));
  };

  const handlePromptChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextPrompt = event.target.value;
    const nextCursor = event.target.selectionStart ?? nextPrompt.length;

    setPrompt(nextPrompt);
    setResolvedTagTrigger(detectComposerTagTrigger(nextPrompt, nextCursor));
    setActiveTagSuggestionIndex(0);
  };

  const syncTextareaSelection = () => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    const nextCursor = textarea.selectionStart ?? prompt.length;
    setResolvedTagTrigger(detectComposerTagTrigger(prompt, nextCursor));
  };

  const handleSelectTagSuggestion = (item: CodexPathSearchResultItem) => {
    if (!tagTrigger) {
      return;
    }

    const replacement = `@${item.scope === 'current' ? item.relativePath : item.absolutePath} `;
    const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
      prompt,
      tagTrigger.rangeEnd,
      replacement,
    );
    const nextState = replaceTextRange(
      prompt,
      tagTrigger.rangeStart,
      replacementRangeEnd,
      replacement,
    );

    setPrompt(nextState.value);
    setTagTrigger(null);
    setTagSuggestions([]);
    setActiveTagSuggestionIndex(0);

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextState.cursor, nextState.cursor);
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

        <div className="relative min-w-0 flex-1">
          {isTagMenuOpen ? (
            <PathSuggestionMenu
              items={tagSuggestions}
              activeIndex={activeTagSuggestionIndex}
              isLoading={isTagSearchLoading}
              query={tagMenuQuery}
              onHighlight={setActiveTagSuggestionIndex}
              onSelect={handleSelectTagSuggestion}
            />
          ) : null}

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
                    <button
                      type="button"
                      onClick={() => setOpenAttachmentId(attachment.id)}
                      className="block cursor-zoom-in"
                      aria-label={`Open ${attachment.name}`}
                    >
                      <img
                        src={attachment.dataUrl}
                        alt={attachment.name}
                        className="size-16 object-cover"
                      />
                    </button>
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
                onChange={handlePromptChange}
                onClick={syncTextareaSelection}
                onKeyDown={handleKeyDown}
                onKeyUp={syncTextareaSelection}
                onPaste={handlePaste}
                onSelect={syncTextareaSelection}
                disabled={isInputDisabled}
                rows={1}
              />
            </div>
          </form>
        </div>

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
        {composerNotice && (
          <span className="text-destructive/80">{composerNotice}</span>
        )}
      </div>

      <Dialog
        open={openAttachment !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setOpenAttachmentId(null);
          }
        }}
      >
        <DialogContent
          backdropClassName="cursor-zoom-out bg-black/72"
          className="max-w-none w-auto border-0 bg-transparent p-0 shadow-none"
        >
          <DialogTitle className="sr-only">
            {openAttachment ? `Preview ${openAttachment.name}` : 'Image preview'}
          </DialogTitle>
          {openAttachment ? (
            <div className="relative">
              <img
                src={openAttachment.dataUrl}
                alt={openAttachment.name}
                className="max-h-[92vh] max-w-[92vw] rounded-xl object-contain"
              />
              <DialogClose
                className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-background/88 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
                aria-label={`Close ${openAttachment.name}`}
              >
                <XIcon className="size-4" />
              </DialogClose>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
});
