import { memo, useCallback, useEffect, useRef, useState } from 'react';

import {
  BotIcon,
  CheckIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
  PlusIcon,
  SquarePenIcon,
  TerminalIcon,
  XIcon,
  ZapIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Collapsible } from '@base-ui/react/collapsible';

import {
  type CodexChatMessage,
  type CodexSessionActivity,
  type CodexSessionState,
} from '@/renderer/hooks/use-codex-sessions';
import { Button } from '@/shadcn/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import { cn } from '@/shadcn/lib/utils';

const MAX_VISIBLE_ACTIVITIES = 4;
const AUTO_SCROLL_THRESHOLD_PX = 48;

function activityIcon(activity: CodexSessionActivity) {
  if (activity.tone === 'error') return <XIcon className="size-3 text-rose-400/70" />;
  if (activity.tone === 'tool') {
    const label = activity.label.toLowerCase();
    if (label.includes('command') || label.includes('exec') || label.includes('bash'))
      return <TerminalIcon className="size-3 text-muted-foreground/70" />;
    if (label.includes('file') || label.includes('write') || label.includes('edit') || label.includes('read'))
      return <SquarePenIcon className="size-3 text-muted-foreground/70" />;
    return <ZapIcon className="size-3 text-amber-400/70" />;
  }
  return <CheckIcon className="size-3 text-muted-foreground/50" />;
}

function ActivityGroup({ activities }: { activities: CodexSessionActivity[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasOverflow = activities.length > MAX_VISIBLE_ACTIVITIES;
  const visibleActivities = hasOverflow && !isExpanded
    ? activities.slice(-MAX_VISIBLE_ACTIVITIES)
    : activities;

  return (
    <div className="rounded-lg border border-border/40 bg-card/30">
      <Collapsible.Root open={isExpanded} onOpenChange={setIsExpanded}>
        <Collapsible.Trigger className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ZapIcon className="size-3 shrink-0 text-amber-400/70" />
          <span className="font-medium">
            {activities.length} tool {activities.length === 1 ? 'call' : 'calls'}
          </span>
          <ChevronRightIcon
            className={cn(
              'ml-auto size-3 transition-transform duration-200',
              isExpanded && 'rotate-90',
            )}
          />
        </Collapsible.Trigger>
        <Collapsible.Panel>
          <div className="flex flex-col gap-px border-t border-border/30 px-1 py-1">
            {visibleActivities.map((activity) => (
              <div
                key={activity.id}
                className="group flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/30"
              >
                <span className="mt-0.5 shrink-0">{activityIcon(activity)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium text-muted-foreground/80">
                    {activity.label}
                  </div>
                  {activity.detail ? (
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground/50">
                      {activity.detail}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
    </div>
  );
}

function MessageBubble({ message }: { message: CodexChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className={cn('flex max-w-[85%] flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
        {!isUser && message.activities.length > 0 ? (
          <ActivityGroup activities={message.activities} />
        ) : null}

        {message.text.trim().length > 0 ? (
          <div
            className={cn(
              'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
              isUser
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-foreground',
            )}
          >
            <span className="whitespace-pre-wrap">{message.text}</span>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function StreamingMessage({
  text,
  activities,
}: {
  text: string;
  activities: CodexSessionActivity[];
}) {
  const hasText = text.trim().length > 0;
  const hasActivities = activities.length > 0;

  if (!hasText && !hasActivities) return null;

  return (
    <motion.div
      className="flex justify-start"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex max-w-[85%] flex-col items-start gap-2">
        {hasActivities ? <ActivityGroup activities={activities} /> : null}
        {hasText ? (
          <div className="rounded-2xl bg-muted/50 px-4 py-2.5 text-sm leading-relaxed text-foreground">
            <span className="whitespace-pre-wrap">{text}</span>
            <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-foreground/40" />
          </div>
        ) : (
          <div className="flex items-center gap-2 px-1 py-1">
            <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground/60" />
            <span className="text-xs text-muted-foreground/60">Thinking...</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export const SessionTranscript = memo(function SessionTranscript({
  sessionState,
  targetLabel,
  onCreateSession,
}: {
  sessionState: CodexSessionState;
  targetLabel: string;
  onCreateSession: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const hasConversation =
    sessionState.messages.length > 0 ||
    sessionState.streamingAssistantText.trim().length > 0 ||
    sessionState.currentTurnActivities.length > 0;

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom <= AUTO_SCROLL_THRESHOLD_PX;
  }, []);

  useEffect(() => {
    const element = scrollRef.current;

    if (!element || !shouldAutoScrollRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    sessionState.messages.length,
    sessionState.streamingAssistantText,
    sessionState.currentTurnActivities.length,
  ]);

  if (!hasConversation) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <Empty className="border-border bg-card/30">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BotIcon />
            </EmptyMedia>
            <EmptyTitle>Codex is ready for {targetLabel}</EmptyTitle>
            <EmptyDescription>
              Use the input below to inspect, edit, or compare code in this target.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" onClick={onCreateSession}>
              <PlusIcon data-icon="inline-start" />
              New session on current branch
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-3">
        <AnimatePresence mode="popLayout">
          {sessionState.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </AnimatePresence>

        {sessionState.status === 'running' ? (
          <StreamingMessage
            text={sessionState.streamingAssistantText}
            activities={sessionState.currentTurnActivities}
          />
        ) : null}
      </div>
    </div>
  );
});
