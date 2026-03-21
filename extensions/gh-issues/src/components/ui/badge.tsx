import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: 'outline' | 'secondary' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground',
        variant === 'secondary' && 'bg-muted',
        className,
      )}
      {...props}
    />
  );
}
