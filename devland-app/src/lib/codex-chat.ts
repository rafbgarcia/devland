export const CODEX_MODEL_OPTIONS = [
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3-Codex' },
  { value: 'gpt-5.3-codex-spark', label: 'GPT-5.3-Codex-Spark' },
  { value: 'gpt-5.2-codex', label: 'GPT-5.2-Codex' },
  { value: 'gpt-5.2', label: 'GPT-5.2' },
] as const;

export const CODEX_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const;
export const CODEX_RUNTIME_MODES = ['approval-required', 'full-access'] as const;
export const CODEX_INTERACTION_MODES = ['default', 'plan'] as const;
export const CODEX_INTERACTION_MODE_LABEL = 'Chat';
export const CODEX_IMAGE_ATTACHMENTS_MAX_COUNT = 8;
export const CODEX_IMAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CODEX_IMAGE_ATTACHMENT_MAX_BYTES_LABEL = `${Math.round(CODEX_IMAGE_ATTACHMENT_MAX_BYTES / (1024 * 1024))}MB`;

export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number];
export type CodexRuntimeMode = (typeof CODEX_RUNTIME_MODES)[number];
export type CodexInteractionMode = (typeof CODEX_INTERACTION_MODES)[number];
export type CodexModelOption = (typeof CODEX_MODEL_OPTIONS)[number];

export type CodexComposerSettings = {
  model: string;
  reasoningEffort: CodexReasoningEffort;
  fastMode: boolean;
  runtimeMode: CodexRuntimeMode;
  interactionMode: CodexInteractionMode;
};

export type CodexImageAttachmentInput = {
  type: 'image';
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
};

export type CodexChatImageAttachment = {
  type: 'image';
  name: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl: string | null;
};

export type CodexPromptAttachment = {
  type: 'image';
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl: string;
};

export type CodexPromptSubmission = {
  prompt: string;
  settings: CodexComposerSettings;
  attachments: CodexPromptAttachment[];
  persistedAttachments?: CodexChatImageAttachment[];
};

export const DEFAULT_CODEX_COMPOSER_SETTINGS: CodexComposerSettings = {
  model: CODEX_MODEL_OPTIONS[0].value,
  reasoningEffort: 'high',
  fastMode: false,
  runtimeMode: 'approval-required',
  interactionMode: 'default',
};

export function codexReasoningEffortLabel(value: CodexReasoningEffort): string {
  switch (value) {
    case 'low':
      return 'Low';
    case 'medium':
      return 'Medium';
    case 'high':
      return 'High';
    case 'xhigh':
      return 'Extra High';
  }
}

export function codexRuntimeModeLabel(value: CodexRuntimeMode): string {
  return value === 'full-access' ? 'Full access' : 'Supervised';
}

export function codexInteractionModeLabel(value: CodexInteractionMode): string {
  return value === 'plan' ? 'Plan' : 'Chat';
}

export function codexFastModeLabel(enabled: boolean): string {
  return enabled ? 'Fast' : 'Off';
}

export function codexAttachmentSummary(
  attachments: readonly Pick<CodexChatImageAttachment, 'name'>[],
): string | null {
  if (attachments.length === 0) {
    return null;
  }

  const firstAttachment = attachments[0];

  if (!firstAttachment) {
    return null;
  }

  if (attachments.length === 1) {
    return `Attached image: ${firstAttachment.name}`;
  }

  return `Attached ${attachments.length} images (first: ${firstAttachment.name})`;
}

export function summarizeCodexUserMessage(input: {
  text: string;
  attachments?: readonly Pick<CodexChatImageAttachment, 'name'>[];
}): string {
  const trimmedText = input.text.trim();
  const attachmentSummary = codexAttachmentSummary(input.attachments ?? []);

  if (trimmedText.length > 0 && attachmentSummary) {
    return `${trimmedText}\n\n[${attachmentSummary}]`;
  }

  if (trimmedText.length > 0) {
    return trimmedText;
  }

  if (attachmentSummary) {
    return attachmentSummary;
  }

  return '(empty message)';
}
