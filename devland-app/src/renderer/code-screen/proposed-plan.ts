export type ParsedProposedPlanMessage = {
  before: string | null;
  planMarkdown: string;
  after: string | null;
};

const PROPOSED_PLAN_BLOCK_PATTERN = /<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/i;

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseProposedPlanMessage(text: string): ParsedProposedPlanMessage | null {
  const match = PROPOSED_PLAN_BLOCK_PATTERN.exec(text);

  if (!match) {
    return null;
  }

  const block = normalizeOptionalText(match[1] ?? '');

  if (!block) {
    return null;
  }

  return {
    before: normalizeOptionalText(text.slice(0, match.index)),
    planMarkdown: block,
    after: normalizeOptionalText(text.slice(match.index + match[0].length)),
  };
}

export function proposedPlanTitle(planMarkdown: string): string | null {
  const heading = planMarkdown.match(/^\s{0,3}#{1,6}\s+(.+)$/m)?.[1]?.trim();
  return heading && heading.length > 0 ? heading : null;
}

export function stripDisplayedPlanMarkdown(planMarkdown: string): string {
  const lines = planMarkdown.trimEnd().split(/\r?\n/);
  const sourceLines = lines[0] && /^\s{0,3}#{1,6}\s+/.test(lines[0]) ? lines.slice(1) : [...lines];

  while (sourceLines[0]?.trim().length === 0) {
    sourceLines.shift();
  }

  const summaryHeading = sourceLines[0]?.match(/^\s{0,3}#{1,6}\s+(.+)$/)?.[1]?.trim().toLowerCase();
  if (summaryHeading === 'summary') {
    sourceLines.shift();

    while (sourceLines[0]?.trim().length === 0) {
      sourceLines.shift();
    }
  }

  return sourceLines.join('\n');
}

export function buildCollapsedProposedPlanPreviewMarkdown(
  planMarkdown: string,
  options?: {
    maxLines?: number;
  },
): string {
  const maxLines = options?.maxLines ?? 6;
  const lines = stripDisplayedPlanMarkdown(planMarkdown)
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const previewLines: string[] = [];
  let visibleLineCount = 0;
  let hasMoreContent = false;

  for (const line of lines) {
    const isVisibleLine = line.trim().length > 0;
    if (isVisibleLine && visibleLineCount >= maxLines) {
      hasMoreContent = true;
      break;
    }

    previewLines.push(line);

    if (isVisibleLine) {
      visibleLineCount += 1;
    }
  }

  while (previewLines.length > 0 && previewLines.at(-1)?.trim().length === 0) {
    previewLines.pop();
  }

  if (previewLines.length === 0) {
    return proposedPlanTitle(planMarkdown) ?? 'Plan preview unavailable.';
  }

  if (hasMoreContent) {
    previewLines.push('', '...');
  }

  return previewLines.join('\n');
}

export function buildPlanImplementationPrompt(planMarkdown: string): string {
  return `PLEASE IMPLEMENT THIS PLAN:\n${planMarkdown.trim()}`;
}

export function resolvePlanFollowUpSubmission(input: {
  draftText: string;
  planMarkdown: string;
}): {
  text: string;
  interactionMode: 'default' | 'plan';
} {
  const trimmedDraftText = input.draftText.trim();

  if (trimmedDraftText.length > 0) {
    return {
      text: trimmedDraftText,
      interactionMode: 'plan',
    };
  }

  return {
    text: buildPlanImplementationPrompt(input.planMarkdown),
    interactionMode: 'default',
  };
}
