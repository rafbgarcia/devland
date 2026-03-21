import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Alert({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-sm',
        variant === 'destructive'
          ? 'border-destructive/25 bg-destructive/8 text-destructive'
          : 'border-border bg-card/80 text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-medium leading-none', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-w-0 flex-1 text-sm text-muted-foreground', className)} {...props} />;
}

export function AlertAction({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ml-auto flex shrink-0 items-center', className)} {...props} />;
}
