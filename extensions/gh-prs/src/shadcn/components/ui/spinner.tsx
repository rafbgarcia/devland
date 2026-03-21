import type { ComponentProps } from 'react';

import { LoaderCircleIcon } from 'lucide-react';

import { cn } from '@/shadcn/lib/utils';

export function Spinner({ className, ...props }: ComponentProps<typeof LoaderCircleIcon>) {
  return <LoaderCircleIcon className={cn('size-4 animate-spin', className)} {...props} />;
}
