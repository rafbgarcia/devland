import { useSyncExternalStore } from 'react';

const THIRTY_SECONDS = 30_000;
const listeners = new Set<() => void>();
let intervalId: number | null = null;

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const absoluteTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function start() {
  if (intervalId !== null) {
    return;
  }

  intervalId = window.setInterval(notify, THIRTY_SECONDS);
}

function stop() {
  if (intervalId !== null && listeners.size === 0) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();

  return () => {
    listeners.delete(listener);
    stop();
  };
}

function getSnapshot() {
  return Math.floor(Date.now() / THIRTY_SECONDS);
}

function formatRelativeTime(value: string | number) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return 'invalid date';
  }

  const deltaMs = timestamp - Date.now();
  const absDeltaSeconds = Math.abs(deltaMs) / 1000;

  if (absDeltaSeconds < 60) {
    return relativeTimeFormatter.format(Math.round(deltaMs / 1000), 'second');
  }

  if (absDeltaSeconds < 3600) {
    return relativeTimeFormatter.format(Math.round(deltaMs / 60_000), 'minute');
  }

  if (absDeltaSeconds < 86_400) {
    return relativeTimeFormatter.format(Math.round(deltaMs / 3_600_000), 'hour');
  }

  if (absDeltaSeconds < 2_592_000) {
    return relativeTimeFormatter.format(Math.round(deltaMs / 86_400_000), 'day');
  }

  if (absDeltaSeconds < 31_536_000) {
    return relativeTimeFormatter.format(Math.round(deltaMs / 2_592_000_000), 'month');
  }

  return relativeTimeFormatter.format(Math.round(deltaMs / 31_536_000_000), 'year');
}

export function RelativeTime({
  value,
  className,
}: {
  value: string | number;
  className?: string;
}) {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  const isValid = !Number.isNaN(timestamp);
  const absoluteLabel = isValid ? absoluteTimeFormatter.format(timestamp) : undefined;

  return (
    <time
      className={className}
      dateTime={isValid ? new Date(timestamp).toISOString() : undefined}
      title={absoluteLabel}
    >
      {formatRelativeTime(value)}
    </time>
  );
}
