import { useSyncExternalStore } from 'react';

import { dayjs } from '@/lib/dayjs';
import { formatRelativeTime } from '@/renderer/lib/projects';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shadcn/components/ui/tooltip';

const SECONDS_30 = 30_000;

const relativeTimeListeners = new Set<() => void>();
let relativeTimeInterval: ReturnType<typeof setInterval> | null = null;

const notifyRelativeTimeListeners = () => {
  for (const listener of relativeTimeListeners) {
    listener();
  }
};

const stopRelativeTimeInterval = () => {
  if (relativeTimeInterval !== null && relativeTimeListeners.size === 0) {
    clearInterval(relativeTimeInterval);
    relativeTimeInterval = null;
  }
};

const startRelativeTimeInterval = () => {
  if (relativeTimeInterval !== null) {
    return;
  }

  relativeTimeInterval = setInterval(() => {
    notifyRelativeTimeListeners();
  }, SECONDS_30);
};

const subscribeToRelativeTime = (listener: () => void) => {
  relativeTimeListeners.add(listener);
  startRelativeTimeInterval();

  return () => {
    relativeTimeListeners.delete(listener);
    stopRelativeTimeInterval();
  };
};

const getRelativeTimeSnapshot = () => Math.floor(Date.now() / SECONDS_30);

export function RelativeTime({
  value,
  className,
}: {
  value: string | number;
  className?: string;
}) {
  useSyncExternalStore(
    subscribeToRelativeTime,
    getRelativeTimeSnapshot,
    getRelativeTimeSnapshot,
  );

  const timestamp = dayjs(value);
  const label = formatRelativeTime(value);
  const isValid = timestamp.isValid();
  const dateTime = isValid ? timestamp.toISOString() : undefined;
  const absoluteLabel = isValid ? timestamp.format('MMM D, YYYY h:mm A') : undefined;

  if (!isValid || absoluteLabel === null) {
    return <time className={className} title={absoluteLabel}>{label}</time>;
  }

  return (
    <time className={className} dateTime={dateTime} title={absoluteLabel}>
      {label}
    </time>
  );
}
