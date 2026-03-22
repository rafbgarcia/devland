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
