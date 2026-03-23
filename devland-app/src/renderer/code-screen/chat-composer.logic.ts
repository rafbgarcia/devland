export function deriveChatComposerRuntimeState(input: {
  isRunning: boolean;
  isSending: boolean;
}) {
  return {
    isInputDisabled: false,
    canSubmitPrompt: !input.isSending,
    showInterruptAction: input.isRunning,
  };
}

export function shouldRestoreFailedComposerDraft(input: {
  prompt: string;
  attachmentCount: number;
}) {
  return input.prompt.trim().length === 0 && input.attachmentCount === 0;
}
