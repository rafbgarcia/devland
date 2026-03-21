import { useCallback, useState } from 'react';

import { BotIcon, SearchCodeIcon } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { newCodesSession } from '@/lib/devland';
import { cn } from '@/lib/utils';
import { useCodexPrompt } from '@/hooks/use-codex-prompt';
import { Button } from './ui/button';

function buildPrompt(basePrompt: string, slug: string, issueNumber: number): string {
  return `${basePrompt}\n\nIssue: ${slug}#${issueNumber}`;
}

export function InvestigateButton({
  slug,
  issueNumber,
}: {
  slug: string;
  issueNumber: number;
}) {
  const [prompt] = useCodexPrompt();
  const [launching, setLaunching] = useState(false);

  const launch = useCallback(async () => {
    if (launching) return;
    setLaunching(true);
    try {
      await newCodesSession(buildPrompt(prompt, slug, issueNumber));
    } finally {
      setLaunching(false);
    }
  }, [prompt, slug, issueNumber, launching]);

  const stopPropagation = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  };

    return (
      <Tooltip>
        <TooltipTrigger asChild delay={0}>
          <Button
            size="icon-xs"
            variant="outline"
            disabled={launching}
            onClick={(event) => {
              event.stopPropagation();
              void launch();
            }}
            onKeyDown={stopPropagation}
            onPointerDown={stopPropagation}
          >
            <BotIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{launching ? 'Launching...' : 'Investigate with Codex'}</TooltipContent>
      </Tooltip>
    );
}
