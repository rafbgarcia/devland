export function getHighlightContentLines(
  loadedContentLines: ReadonlyArray<string>,
  requestedLines: ReadonlyArray<number>,
) {
  if (requestedLines.length === 0 || loadedContentLines.length === 0) {
    return [] as string[];
  }

  // Shiki needs the surrounding file context to carry grammar state line-to-line.
  // Sparse hunk reconstruction produces misleading tokens, so we prefer no syntax
  // highlighting when the full side contents are unavailable.
  return [...loadedContentLines];
}
