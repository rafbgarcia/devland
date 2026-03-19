export type ComposerTagSearchScope = 'current' | 'global';

export type ComposerTagTrigger = {
  scope: ComposerTagSearchScope;
  query: string;
  rangeStart: number;
  rangeEnd: number;
};

function clampCursor(value: string, cursor: number): number {
  if (!Number.isFinite(cursor)) {
    return value.length;
  }

  return Math.max(0, Math.min(value.length, Math.floor(cursor)));
}

function isWhitespace(character: string): boolean {
  return character === ' ' || character === '\n' || character === '\r' || character === '\t';
}

function tokenStartForCursor(value: string, cursor: number): number {
  let index = cursor - 1;

  while (index >= 0 && !isWhitespace(value[index] ?? '')) {
    index -= 1;
  }

  return index + 1;
}

export function detectComposerTagTrigger(
  value: string,
  cursorInput: number,
): ComposerTagTrigger | null {
  const cursor = clampCursor(value, cursorInput);
  const tokenStart = tokenStartForCursor(value, cursor);
  const token = value.slice(tokenStart, cursor);

  if (!token.startsWith('@')) {
    return null;
  }

  if (token.startsWith('@/')) {
    return {
      scope: 'global',
      query: token.slice(2),
      rangeStart: tokenStart,
      rangeEnd: cursor,
    };
  }

  return {
    scope: 'current',
    query: token.slice(1),
    rangeStart: tokenStart,
    rangeEnd: cursor,
  };
}

export function areComposerTagTriggersEqual(
  left: ComposerTagTrigger | null,
  right: ComposerTagTrigger | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (left === null || right === null) {
    return left === right;
  }

  return (
    left.scope === right.scope &&
    left.query === right.query &&
    left.rangeStart === right.rangeStart &&
    left.rangeEnd === right.rangeEnd
  );
}

export function replaceTextRange(
  value: string,
  rangeStart: number,
  rangeEnd: number,
  replacement: string,
): { value: string; cursor: number } {
  const safeStart = Math.max(0, Math.min(value.length, rangeStart));
  const safeEnd = Math.max(safeStart, Math.min(value.length, rangeEnd));

  return {
    value: `${value.slice(0, safeStart)}${replacement}${value.slice(safeEnd)}`,
    cursor: safeStart + replacement.length,
  };
}
