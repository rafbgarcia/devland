import { AlertTriangleIcon } from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shadcn/components/ui/tooltip';
import { Kbd } from '@/shadcn/components/ui/kbd';

export function MissingGhCli({ tooltip, className }: { tooltip?: React.ReactNode, className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild className={className}>
        <AlertTriangleIcon className="inline-block size-4 text-yellow-500" />
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start">
        <span className="font-medium">Github's <Kbd>gh</Kbd> CLI not found</span>
        {tooltip && <span className="text-background/70">{tooltip}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
