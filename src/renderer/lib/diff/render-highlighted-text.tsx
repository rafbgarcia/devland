import type { ReactNode } from 'react';

import {
  MAX_INTRA_LINE_DIFF_LENGTH,
  type DiffHighlightLineTokens,
  type DiffHighlightTokens,
} from '@/lib/diff';

type ChangeRange = {
  location: number;
  length: number;
};

function rangeMax(range: ChangeRange) {
  return range.location + range.length;
}

function commonLength(
  stringA: string,
  rangeA: ChangeRange,
  stringB: string,
  rangeB: ChangeRange,
  reverse: boolean,
) {
  const max = Math.min(rangeA.length, rangeB.length);
  const startA = reverse ? rangeMax(rangeA) - 1 : rangeA.location;
  const startB = reverse ? rangeMax(rangeB) - 1 : rangeB.location;
  const stride = reverse ? -1 : 1;

  let length = 0;
  while (Math.abs(length) < max) {
    if (stringA[startA + length] !== stringB[startB + length]) {
      break;
    }

    length += stride;
  }

  return Math.abs(length);
}

function relativeChanges(stringA: string, stringB: string) {
  let rangeA = { location: 0, length: stringA.length };
  let rangeB = { location: 0, length: stringB.length };

  const prefixLength = commonLength(stringA, rangeA, stringB, rangeB, false);
  rangeA = {
    location: rangeA.location + prefixLength,
    length: rangeA.length - prefixLength,
  };
  rangeB = {
    location: rangeB.location + prefixLength,
    length: rangeB.length - prefixLength,
  };

  const suffixLength = commonLength(stringA, rangeA, stringB, rangeB, true);
  rangeA.length -= suffixLength;
  rangeB.length -= suffixLength;

  return { rangeA, rangeB };
}

function mapKeysEqual(a: Map<string, number>, b: Map<string, number>) {
  if (a.size !== b.size) {
    return false;
  }

  for (const key of a.keys()) {
    if (!b.has(key)) {
      return false;
    }
  }

  return true;
}

export function getHighlightTokensForLine(
  lineNumber: number | null,
  tokens: DiffHighlightTokens | undefined | null,
) {
  if (lineNumber === null || !tokens) {
    return null;
  }

  return tokens[lineNumber - 1] ?? null;
}

export function getIntraLineDiffTokens(
  before: string,
  after: string,
): { before: DiffHighlightLineTokens; after: DiffHighlightLineTokens } | null {
  if (before.length >= MAX_INTRA_LINE_DIFF_LENGTH || after.length >= MAX_INTRA_LINE_DIFF_LENGTH) {
    return null;
  }

  const changes = relativeChanges(before, after);

  return {
    before: {
      [changes.rangeA.location]: {
        length: changes.rangeA.length,
        token: 'diff-delete-inner',
      },
    },
    after: {
      [changes.rangeB.location]: {
        length: changes.rangeB.length,
        token: 'diff-add-inner',
      },
    },
  };
}

export function renderHighlightedText(
  line: string,
  tokenLayers: ReadonlyArray<DiffHighlightLineTokens | null | undefined>,
): ReactNode {
  if (line.length === 0) {
    return '\u00A0';
  }

  const segments: Array<{ content: string; tokens: Map<string, number> }> = [];
  let currentSegment = {
    content: '',
    tokens: new Map<string, number>(),
  };

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    const nextTokens = new Map<string, number>();

    for (const [token, endPosition] of currentSegment.tokens) {
      if (endPosition > index) {
        nextTokens.set(token, endPosition);
      }
    }

    for (const tokenLayer of tokenLayers) {
      const token = tokenLayer?.[index];

      if (!token || token.length <= 0) {
        continue;
      }

      for (const tokenName of token.token.split(' ')) {
        const nextEnd = index + token.length;
        const previousEnd = nextTokens.get(tokenName);

        if (previousEnd === undefined || nextEnd > previousEnd) {
          nextTokens.set(tokenName, nextEnd);
        }
      }
    }

    if (mapKeysEqual(currentSegment.tokens, nextTokens)) {
      currentSegment.content += character;
      currentSegment.tokens = nextTokens;
      continue;
    }

    segments.push(currentSegment);
    currentSegment = {
      content: character,
      tokens: nextTokens,
    };
  }

  segments.push(currentSegment);

  return segments.map((segment, index) => {
    if (segment.tokens.size === 0) {
      return segment.content;
    }

    return (
      <span
        key={`${index}:${segment.content}`}
        className={[...segment.tokens.keys()].map((token) => `cm-${token}`).join(' ')}
      >
        {segment.content}
      </span>
    );
  });
}
