export function appendPromptBlock(currentPrompt: string, nextBlock: string): string {
  const normalizedBlock = nextBlock.trim();

  if (normalizedBlock.length === 0) {
    return currentPrompt;
  }

  if (currentPrompt.length === 0) {
    return normalizedBlock;
  }

  if (currentPrompt.endsWith('\n\n')) {
    return `${currentPrompt}${normalizedBlock}`;
  }

  if (currentPrompt.endsWith('\n')) {
    return `${currentPrompt}\n${normalizedBlock}`;
  }

  return `${currentPrompt}\n\n${normalizedBlock}`;
}

export function formatAnchoredDiffCommentPrompt({
  filepath,
  lineStart,
  lineEnd,
  comment,
}: {
  filepath: string;
  lineStart: number;
  lineEnd: number;
  comment: string;
}): string {
  return `**${filepath}:${lineStart}-${lineEnd}**\n${comment.trim()}`;
}
