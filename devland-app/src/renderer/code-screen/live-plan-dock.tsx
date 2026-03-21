import { memo, useEffect, useRef, useState } from 'react';

import { CheckIcon, ChevronDownIcon, ChevronUpIcon, LoaderCircleIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { CodexPlanStep, CodexPlanStepStatus } from '@/ipc/contracts';
import type { ActiveCodexPlan } from '@/renderer/code-screen/codex-session-state';
import { cn } from '@/shadcn/lib/utils';

function StepStatusIcon({ status }: { status: CodexPlanStepStatus }) {
  if (status === 'completed') {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
        <CheckIcon className="size-2.5" />
      </span>
    );
  }

  if (status === 'inProgress') {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
        <LoaderCircleIcon className="size-2.5 animate-spin" />
      </span>
    );
  }

  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30">
      <span className="size-1 rounded-full bg-muted-foreground/30" />
    </span>
  );
}

function PlanStepRow({ step, animate }: { step: CodexPlanStep; animate: boolean }) {
  const [wasCompleted, setWasCompleted] = useState(step.status === 'completed');
  const prevStatusRef = useRef(step.status);

  useEffect(() => {
    if (prevStatusRef.current !== 'completed' && step.status === 'completed') {
      setWasCompleted(false);
      requestAnimationFrame(() => setWasCompleted(true));
    } else if (step.status === 'completed') {
      setWasCompleted(true);
    }

    prevStatusRef.current = step.status;
  }, [step.status]);

  const isCompleted = step.status === 'completed';

  return (
    <motion.div
      layout="position"
      initial={animate ? { opacity: 0, y: 4 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'flex items-start gap-2 rounded-md px-2 py-1 transition-colors duration-200',
        step.status === 'inProgress' && 'bg-blue-500/5',
      )}
    >
      <div className="mt-0.5">
        <StepStatusIcon status={step.status} />
      </div>
      <p
        className={cn(
          'text-xs leading-snug transition-all duration-300',
          isCompleted
            ? 'text-muted-foreground/40'
            : step.status === 'inProgress'
              ? 'text-foreground/90'
              : 'text-muted-foreground/60',
          isCompleted && wasCompleted && 'line-through decoration-muted-foreground/20',
        )}
      >
        {step.step}
      </p>
    </motion.div>
  );
}

function getFocusStep(plan: CodexPlanStep[]): CodexPlanStep | null {
  const inProgress = plan.find((s) => s.status === 'inProgress');

  if (inProgress) {
    return inProgress;
  }

  const firstPending = plan.find((s) => s.status === 'pending');

  if (firstPending) {
    return firstPending;
  }

  return plan.at(-1) ?? null;
}

export function getFocusPlanStep(plan: CodexPlanStep[]): CodexPlanStep | null {
  return getFocusStep(plan);
}

export function shouldShowMinimizedTask(plan: CodexPlanStep[]): boolean {
  return plan.some((step) => step.status !== 'completed');
}

export const LivePlanDock = memo(function LivePlanDock({
  activePlan,
  isRunning,
}: {
  activePlan: ActiveCodexPlan | null;
  isRunning: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const prevPlanTurnIdRef = useRef<string | null>(null);
  const prevIsRunningRef = useRef(isRunning);

  useEffect(() => {
    if (!activePlan) {
      return;
    }

    if (activePlan.turnId !== prevPlanTurnIdRef.current) {
      setIsExpanded(true);
      prevPlanTurnIdRef.current = activePlan.turnId;
    }
  }, [activePlan]);

  useEffect(() => {
    if (prevIsRunningRef.current && !isRunning) {
      setIsExpanded(false);
    }

    prevIsRunningRef.current = isRunning;
  }, [isRunning]);

  if (!activePlan || activePlan.plan.length === 0) {
    return null;
  }

  const focusStep = getFocusPlanStep(activePlan.plan);
  const completedCount = activePlan.plan.filter((s) => s.status === 'completed').length;
  const totalCount = activePlan.plan.length;
  const showMinimizedTask = shouldShowMinimizedTask(activePlan.plan);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
        className="mb-2 overflow-hidden rounded-lg border border-border/60 bg-muted/20"
      >
        {/* Header */}
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/30"
        >
          <span className="rounded bg-blue-500/10 px-1.5 py-px text-[10px] font-semibold tracking-wide text-blue-400 uppercase">
            Tasks
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground/40">
            {completedCount}/{totalCount}
          </span>
          <span className="flex-1" />
          {isExpanded ? (
            <ChevronDownIcon className="size-3 text-muted-foreground/40" />
          ) : (
            <ChevronUpIcon className="size-3 text-muted-foreground/40" />
          )}
        </button>

        {/* Expanded: all steps */}
        <AnimatePresence initial={false}>
          {isExpanded ? (
            <motion.div
              key="expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              className="overflow-hidden"
            >
              <div className="space-y-0.5 px-1 pb-2">
                {activePlan.plan.map((step, index) => (
                  <PlanStepRow
                    key={`${index}:${step.step}`}
                    step={step}
                    animate={true}
                  />
                ))}
              </div>
            </motion.div>
          ) : focusStep && showMinimizedTask ? (
            <motion.div
              key="minimized"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              className="overflow-hidden"
            >
              <div className="px-1 pb-2">
                <PlanStepRow step={focusStep} animate={false} />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
});
