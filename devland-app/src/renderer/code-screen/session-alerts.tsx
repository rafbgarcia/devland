import { memo, useMemo, useState } from 'react';

import type { PendingApproval, PendingUserInput } from '@/renderer/code-screen/codex-session-state';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';

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
        <div className="mb-2">
          <Alert variant="destructive">
            <AlertTitle>Codex session error</AlertTitle>
            <AlertDescription>{sessionError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {activePendingApproval ? (
        <div className="mb-2">
          <Alert>
            <AlertTitle>{activePendingApproval.title}</AlertTitle>
            <AlertDescription>
              {activePendingApproval.command ??
                activePendingApproval.detail ??
                'Codex requested approval to continue.'}
            </AlertDescription>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                type="button"
                onClick={() =>
                  void onRespondToApproval(
                    targetId,
                    activePendingApproval.requestId,
                    'accept',
                  )
                }
              >
                Accept once
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() =>
                  void onRespondToApproval(
                    targetId,
                    activePendingApproval.requestId,
                    'acceptForSession',
                  )
                }
              >
                Accept for session
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() =>
                  void onRespondToApproval(
                    targetId,
                    activePendingApproval.requestId,
                    'decline',
                  )
                }
              >
                Decline
              </Button>
            </div>
          </Alert>
        </div>
      ) : null}

      {activePendingUserInput ? (
        <div className="mb-2">
          <Alert>
            <AlertTitle>User input requested</AlertTitle>
            <AlertDescription>
              Codex needs a structured answer before it can continue.
            </AlertDescription>
            <div className="mt-3 flex flex-col gap-3">
              {activePendingUserInput.questions.map((question: PendingUserInput['questions'][number]) => (
                <div key={question.id} className="flex flex-col gap-2">
                  <div className="text-sm font-medium">{question.question}</div>
                  <div className="flex flex-wrap gap-2">
                    {question.options.map((option: PendingUserInput['questions'][number]['options'][number]) => {
                      const isSelected = activeDraftAnswers[question.id] === option.label;

                      return (
                        <Button
                          key={option.label}
                          size="sm"
                          type="button"
                          variant={isSelected ? 'default' : 'outline'}
                          onClick={() =>
                            setDraftAnswersByRequest((current) => ({
                              ...current,
                              [activePendingUserInput.requestId]: {
                                ...(current[activePendingUserInput.requestId] ?? {}),
                                [question.id]: option.label,
                              },
                            }))
                          }
                        >
                          {option.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  size="sm"
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
                >
                  Submit answers
                </Button>
              </div>
            </div>
          </Alert>
        </div>
      ) : null}
    </>
  );
});
