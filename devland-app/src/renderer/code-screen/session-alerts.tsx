import { memo, useMemo, useState } from 'react';

import { CircleAlertIcon, ShieldQuestionIcon } from 'lucide-react';

import type { PendingApproval, PendingUserInput } from '@/renderer/code-screen/codex-session-state';
import { cn } from '@/shadcn/lib/utils';

export const SessionAlerts = memo(function SessionAlerts({
  targetId,
  sessionError,
  pendingApprovals,
  pendingUserInputs,
  onRespondToApproval,
  onRespondToUserInput,
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
}) {
  const activePendingApproval = pendingApprovals[0] ?? null;
  const activePendingUserInput = pendingUserInputs[0] ?? null;
  const [draftAnswersByRequest, setDraftAnswersByRequest] = useState<Record<string, Record<string, string>>>({});

  const activeDraftAnswers = useMemo(
    () => activePendingUserInput === null
      ? {}
      : (draftAnswersByRequest[activePendingUserInput.requestId] ?? {}),
    [activePendingUserInput, draftAnswersByRequest],
  );

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
        <div className="mb-2 rounded-lg border border-border/60 bg-muted/30">
          <div className="flex items-start gap-2.5 px-3 pt-2.5 pb-2">
            <ShieldQuestionIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500/70" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground/90">Input needed</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-border/40 px-3 py-2.5">
            {activePendingUserInput.questions.map((question: PendingUserInput['questions'][number]) => (
              <div key={question.id} className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-foreground/80">{question.question}</p>
                <div className="flex flex-wrap gap-1">
                  {question.options.map((option: PendingUserInput['questions'][number]['options'][number]) => {
                    const isSelected = activeDraftAnswers[question.id] === option.label;

                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() =>
                          setDraftAnswersByRequest((current) => ({
                            ...current,
                            [activePendingUserInput.requestId]: {
                              ...(current[activePendingUserInput.requestId] ?? {}),
                              [question.id]: option.label,
                            },
                          }))
                        }
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-[11px] transition-colors',
                          isSelected
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground',
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              disabled={
                activePendingUserInput.questions.some(
                  (question: PendingUserInput['questions'][number]) => !activeDraftAnswers[question.id],
                )
              }
              onClick={() =>
                void onRespondToUserInput(
                  targetId,
                  activePendingUserInput.requestId,
                  activeDraftAnswers,
                )
              }
              className="self-start rounded-md bg-primary/90 px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary disabled:pointer-events-none disabled:opacity-40"
            >
              Submit
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
});
