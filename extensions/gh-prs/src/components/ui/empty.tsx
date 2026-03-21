import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Empty({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex min-h-[16rem] w-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center',
        className,
      )}
      {...props}
    />
  );
}

export function EmptyHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex max-w-lg flex-col items-center gap-3', className)} {...props} />;
}

export function EmptyMedia({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: 'icon' }) {
  return (
    <div
      className={cn(
        'flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground',
        variant === 'icon' && 'size-12',
        className,
      )}
      {...props}
    />
  );
}

export function EmptyTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold', className)} {...props} />;
}

export function EmptyDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function EmptyContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-4 flex flex-col items-center gap-3', className)} {...props} />;
}
