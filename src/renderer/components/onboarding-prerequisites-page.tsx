import { CommandIcon, ShieldCheckIcon } from 'lucide-react';

import type { GhUser } from '@/ipc/contracts';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Badge } from '@/shadcn/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shadcn/components/ui/card';

export function OnboardingPrerequisitesPage({ user }: { user: GhUser | null }) {
  return (
    <section className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div className="flex max-w-2xl flex-col justify-center gap-8 animate-in fade-in slide-in-from-left-6 duration-700">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Prerequisites</Badge>
          <Badge variant="outline">GitHub CLI required</Badge>
          <Badge variant="secondary">Login required</Badge>
        </div>

        <div className="flex flex-col gap-5">
          <p className="text-sm uppercase tracking-[0.32em] text-muted-foreground">
            Devland
          </p>
          <h1 className="display-face max-w-3xl text-5xl leading-none sm:text-6xl lg:text-7xl">
            Start with a repo you already trust.
          </h1>
          <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Devland delegates GitHub access to the `gh` CLI from the Electron main
            process. Install it, log in once, then reopen the app.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ValueCard
            icon={<ShieldCheckIcon />}
            title="Renderer stays isolated"
            body="React code reads typed IPC data. Shell access remains outside the renderer."
          />
          <ValueCard
            icon={<CommandIcon />}
            title="One auth checkpoint"
            body="Once `gh auth login` succeeds, project tabs can fetch GitHub issues and pull requests directly."
          />
        </div>
      </div>

      <Card className="w-full animate-in fade-in slide-in-from-right-6 duration-700 delay-150">
        <CardHeader className="gap-4">
          <Badge variant="outline">
            {user === null ? 'Waiting for `gh` login' : `Signed in as ${user.login}`}
          </Badge>
          <CardTitle>
            <span className="display-face text-3xl leading-tight sm:text-4xl">
              Please install the `gh` CLI and log in.
            </span>
          </CardTitle>
          <CardDescription>
            <span className="text-base leading-7">
              Devland blocks the workspace until GitHub CLI authentication is ready.
            </span>
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <Alert>
            <CommandIcon />
            <AlertTitle>Quick check</AlertTitle>
            <AlertDescription>
              Confirm `gh --version` works and `gh auth status` shows an active account
              in your terminal.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </section>
  );
}

function ValueCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card size="sm">
      <CardHeader className="gap-3">
        <div className="inline-flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{body}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}
