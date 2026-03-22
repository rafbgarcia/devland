import type { CSSProperties } from 'react';

import type { CodexThreadTokenUsage } from '@/ipc/contracts';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/shadcn/components/ui/hover-card';
import { cn } from '@/shadcn/lib/utils';

const RING_SIZE = 22;
const RING_STROKE_WIDTH = 2.5;
const RING_RADIUS = 8;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export type ChatContextWindowIndicatorState = {
  ariaLabel: string;
  maxTokens: number;
  percentLeft: number;
  percentUsed: number;
  progressOffset: number;
  usedTokens: number;
  usedTokensLabel: string;
  maxTokensLabel: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function formatCompactTokenCount(value: number): string {
  if (value < 1_000) {
    return `${value}`;
  }

  if (value < 10_000) {
    const compact = Math.round((value / 1_000) * 10) / 10;
    return `${compact % 1 === 0 ? compact.toFixed(0) : compact.toFixed(1)}k`;
  }

  return `${Math.round(value / 1_000)}k`;
}

function getSeverity(percentUsed: number): ChatContextWindowIndicatorState['severity'] {
  if (percentUsed >= 90) return 'critical';
  if (percentUsed >= 70) return 'high';
  if (percentUsed >= 40) return 'moderate';
  return 'low';
}

const SEVERITY_RING_CLASS: Record<ChatContextWindowIndicatorState['severity'], string> = {
  low: 'text-muted-foreground/40',
  moderate: 'text-muted-foreground/40',
  high: 'text-amber-500/60',
  critical: 'text-red-500/60',
};

const SEVERITY_BAR_CLASS: Record<ChatContextWindowIndicatorState['severity'], string> = {
  low: 'bg-emerald-500/70',
  moderate: 'bg-emerald-500/70',
  high: 'bg-amber-500/70',
  critical: 'bg-red-500/70',
};

const EMPTY_STATE: ChatContextWindowIndicatorState = {
  ariaLabel: '0% of the Codex context window used',
  maxTokens: 0,
  percentLeft: 100,
  percentUsed: 0,
  progressOffset: RING_CIRCUMFERENCE,
  usedTokens: 0,
  usedTokensLabel: '0',
  maxTokensLabel: '—',
  severity: 'low',
};

export function deriveChatContextWindowIndicatorState(
  tokenUsage: CodexThreadTokenUsage | null,
): ChatContextWindowIndicatorState {
  const maxTokens = tokenUsage?.modelContextWindow ?? null;
  // The desktop Codex app context meter reflects the latest turn's footprint,
  // not the cumulative total across the whole thread.
  const usedTokens = tokenUsage?.last.totalTokens ?? null;

  if (!maxTokens || maxTokens <= 0 || usedTokens === null) {
    return EMPTY_STATE;
  }

  const percentUsed = clampPercent((usedTokens / maxTokens) * 100);
  const percentLeft = clampPercent(100 - percentUsed);

  return {
    ariaLabel: `${Math.round(percentUsed)}% of the Codex context window used`,
    maxTokens,
    percentLeft,
    percentUsed,
    progressOffset: RING_CIRCUMFERENCE - (percentUsed / 100) * RING_CIRCUMFERENCE,
    usedTokens,
    usedTokensLabel: formatCompactTokenCount(usedTokens),
    maxTokensLabel: formatCompactTokenCount(maxTokens),
    severity: getSeverity(percentUsed),
  };
}

export function ChatContextWindowIndicator({
  tokenUsage,
  className,
}: {
  tokenUsage: CodexThreadTokenUsage | null;
  className?: string;
}) {
  const state = deriveChatContextWindowIndicatorState(tokenUsage);

  const progressStyle = {
    strokeDasharray: `${RING_CIRCUMFERENCE}`,
    strokeDashoffset: `${state.progressOffset}`,
  } satisfies CSSProperties;

  return (
    <HoverCard>
      <HoverCardTrigger
        delay={120}
        render={
          <button
            type="button"
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
              className,
            )}
            aria-label={state.ariaLabel}
          />
        }
      >
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          className={cn('-rotate-90', SEVERITY_RING_CLASS[state.severity])}
          aria-hidden="true"
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={RING_STROKE_WIDTH}
            className="opacity-20"
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={RING_STROKE_WIDTH}
            strokeLinecap="round"
            style={progressStyle}
            className="transition-[stroke-dashoffset] duration-500 ease-out"
          />
        </svg>
      </HoverCardTrigger>

      <HoverCardContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-56 rounded-xl px-4 py-3.5"
      >
        <div className="space-y-3 text-[13px]">
          <div className="flex items-baseline justify-between">
            <span className="font-medium text-foreground">Context</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {state.usedTokensLabel} / {state.maxTokensLabel}
            </span>
          </div>

          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500 ease-out',
                  SEVERITY_BAR_CLASS[state.severity],
                )}
                style={{ width: `${Math.max(state.percentUsed, 2)}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>{Math.round(state.percentUsed)}% used</span>
              <span>{Math.round(state.percentLeft)}% left</span>
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
