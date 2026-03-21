import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  InfoIcon,
  ShieldQuestionIcon,
} from 'lucide-react';

import type { PendingApproval, PendingUserInput } from '@/renderer/code-screen/codex-session-state';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shadcn/components/ui/tooltip';
import { cn } from '@/shadcn/lib/utils';

export const SessionAlerts = memo(function SessionAlerts({
  targetId,
  sessionError,
  pendingApprovals,
  pendingUserInputs,
  onRespondToApproval,
  onRespondToUserInput,
  onDismissUserInput,
}: {
  targetId: string;
  sessionError: string | null;
  pendingApprovals: PendingApproval[];
  pendingUserInputs: PendingUserInput[];
  onRespondToApproval: (
    targetId: string,
    requestId: string,
    decision: 'accept' | 'acceptForSession' | 'decline',
  ) => Promise<void>;
  onRespondToUserInput: (
    targetId: string,
    requestId: string,
    answers: Record<string, string>,
  ) => Promise<void>;
  onDismissUserInput: (() => void) | undefined;
}) {
  const activePendingApproval = pendingApprovals[0] ?? null;
  const activePendingUserInput = pendingUserInputs[0] ?? null;

  return (
    <>
      {sessionError ? (
        <div className="mb-2 flex items-start gap-2 rounded-lg bg-destructive/8 px-3 py-2.5">
          <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-destructive/70" />
          <p className="text-xs leading-relaxed text-destructive/90">{sessionError}</p>
        </div>
      ) : null}

      {activePendingApproval ? (
        <div className="mb-2 rounded-lg border border-border/60 bg-muted/30">
          <div className="flex items-start gap-2.5 px-3 pt-2.5 pb-2">
            <ShieldQuestionIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500/70" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground/90">
                {activePendingApproval.title}
              </p>
              {(activePendingApproval.command ?? activePendingApproval.detail) ? (
                <p className="mt-1 truncate font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {activePendingApproval.command ?? activePendingApproval.detail}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1.5 border-t border-border/40 px-3 py-1.5">
            <button
              type="button"
              onClick={() =>
                void onRespondToApproval(
                  targetId,
                  activePendingApproval.requestId,
                  'accept',
                )
              }
              className="rounded-md bg-primary/90 px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() =>
                void onRespondToApproval(
                  targetId,
                  activePendingApproval.requestId,
                  'acceptForSession',
                )
              }
              className="rounded-md px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Always
            </button>
            <button
              type="button"
              onClick={() =>
                void onRespondToApproval(
                  targetId,
                  activePendingApproval.requestId,
                  'decline',
                )
              }
              className="rounded-md px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              Decline
            </button>
          </div>
        </div>
      ) : null}

      {activePendingUserInput ? (
        <UserInputCard
          key={activePendingUserInput.requestId}
          targetId={targetId}
          pendingUserInput={activePendingUserInput}
          onRespond={onRespondToUserInput}
          onDismiss={onDismissUserInput}
        />
      ) : null}
    </>
  );
});

function UserInputCard({
  targetId,
  pendingUserInput,
  onRespond,
  onDismiss,
}: {
  targetId: string;
  pendingUserInput: PendingUserInput;
  onRespond: (
    targetId: string,
    requestId: string,
    answers: Record<string, string>,
  ) => Promise<void>;
  onDismiss: (() => void) | undefined;
}) {
  const { questions, requestId } = pendingUserInput;
  const totalQuestions = questions.length;

  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeQuestion = questions[activeQuestionIndex];
  const selectedOptionLabel = activeQuestion ? answers[activeQuestion.id] ?? null : null;

  const allAnswered = useMemo(
    () => questions.every((q) => answers[q.id] !== undefined),
    [questions, answers],
  );

  const canContinue = allAnswered && !isSubmitting;

  const selectOption = useCallback(
    (label: string) => {
      if (!activeQuestion || isSubmitting) return;
      setAnswers((prev) => ({ ...prev, [activeQuestion.id]: label }));
    },
    [activeQuestion, isSubmitting],
  );

  const goToPreviousQuestion = useCallback(() => {
    setActiveQuestionIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNextQuestion = useCallback(() => {
    setActiveQuestionIndex((prev) => Math.min(totalQuestions - 1, prev + 1));
  }, [totalQuestions]);

  const handleContinue = useCallback(() => {
    if (!canContinue) return;
    setIsSubmitting(true);
    void onRespond(targetId, requestId, answers).finally(() => {
      setIsSubmitting(false);
    });
  }, [canContinue, onRespond, targetId, requestId, answers]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === 'Escape' && onDismiss) {
        e.preventDefault();
        onDismiss();
        return;
      }

      if (e.key === 'Enter' && canContinue) {
        e.preventDefault();
        handleContinue();
        return;
      }

      if (e.key === 'ArrowLeft' && totalQuestions > 1) {
        e.preventDefault();
        goToPreviousQuestion();
        return;
      }

      if (e.key === 'ArrowRight' && totalQuestions > 1) {
        e.preventDefault();
        goToNextQuestion();
        return;
      }

      // Number keys to select options
      if (activeQuestion) {
        const num = Number.parseInt(e.key, 10);
        if (num >= 1 && num <= activeQuestion.options.length) {
          e.preventDefault();
          selectOption(activeQuestion.options[num - 1]!.label);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    onDismiss,
    canContinue,
    handleContinue,
    totalQuestions,
    goToPreviousQuestion,
    goToNextQuestion,
    activeQuestion,
    selectOption,
  ]);

  if (!activeQuestion) return null;

  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-border/60 bg-muted/20">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-foreground/90">
          {activeQuestion.question}
        </p>

        {totalQuestions > 1 ? (
          <div className="flex shrink-0 items-center gap-1 pt-0.5">
            <button
              type="button"
              onClick={goToPreviousQuestion}
              disabled={activeQuestionIndex === 0}
              className="flex size-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              aria-label="Previous question"
            >
              <ChevronLeftIcon className="size-3.5" />
            </button>
            <span className="min-w-[3.5rem] text-center text-[11px] tabular-nums text-muted-foreground/50">
              {activeQuestionIndex + 1} of {totalQuestions}
            </span>
            <button
              type="button"
              onClick={goToNextQuestion}
              disabled={activeQuestionIndex === totalQuestions - 1}
              className="flex size-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              aria-label="Next question"
            >
              <ChevronRightIcon className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {/* Options */}
      <TooltipProvider>
        <div className="flex flex-col gap-px px-2 pb-2">
          {activeQuestion.options.map((option, index) => {
            const isSelected = selectedOptionLabel === option.label;

            return (
              <button
                key={option.label}
                type="button"
                onClick={() => selectOption(option.label)}
                className={cn(
                  'group flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                  isSelected
                    ? 'bg-primary/10 ring-1 ring-primary/25'
                    : 'hover:bg-muted/60',
                )}
              >
                <span
                  className={cn(
                    'text-[11px] tabular-nums',
                    isSelected
                      ? 'text-primary/70'
                      : 'text-muted-foreground/40 group-hover:text-muted-foreground/60',
                  )}
                >
                  {index + 1}.
                </span>
                <span
                  className={cn(
                    'min-w-0 flex-1 text-xs',
                    isSelected
                      ? 'font-medium text-primary'
                      : 'text-foreground/80 group-hover:text-foreground',
                  )}
                >
                  {option.label}
                </span>
                {option.description ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded-full transition-colors',
                          isSelected
                            ? 'text-primary/40'
                            : 'text-muted-foreground/30 group-hover:text-muted-foreground/50',
                        )}
                      >
                        <InfoIcon className="size-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8} className="max-w-[16rem]">
                      {option.description}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </button>
            );
          })}
        </div>
      </TooltipProvider>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border/40 px-3 py-2">
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Dismiss
            <kbd className="rounded border border-border/60 bg-muted/60 px-1 py-px font-mono text-[10px] text-muted-foreground/60">
              ESC
            </kbd>
          </button>
        ) : null}
        <button
          type="button"
          disabled={!canContinue}
          onClick={handleContinue}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium transition-colors',
            canContinue
              ? 'bg-primary/90 text-primary-foreground hover:bg-primary'
              : 'pointer-events-none bg-muted/60 text-muted-foreground/40',
          )}
        >
          Continue
          <kbd
            className={cn(
              'rounded border px-1 py-px font-mono text-[10px]',
              canContinue
                ? 'border-primary-foreground/20 text-primary-foreground/60'
                : 'border-border/40 text-muted-foreground/30',
            )}
          >
            ↵
          </kbd>
        </button>
      </div>
    </div>
  );
}
