import { useEffect, useState } from 'react';

import type { DevlandRepoContext } from '@devlandapp/sdk';

import { ProjectPullRequestsView } from '@/components/project-pull-requests-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { getExtensionContext } from '@/lib/devland';

type AppState =
  | { status: 'loading'; repo: null; error: null }
  | { status: 'ready'; repo: DevlandRepoContext; error: null }
  | { status: 'error'; repo: null; error: string };

export function App() {
  const [state, setState] = useState<AppState>({
    status: 'loading',
    repo: null,
    error: null,
  });

  const loadContext = async () => {
    setState((current) =>
      current.status === 'ready'
        ? current
        : { status: 'loading', repo: null, error: null },
    );

    try {
      const context = await getExtensionContext();

      setState({
        status: 'ready',
        repo: context.repo,
        error: null,
      });
    } catch (error) {
      setState({
        status: 'error',
        repo: null,
        error:
          error instanceof Error
            ? error.message
            : 'Could not resolve repository context.',
      });
    }
  };

  useEffect(() => {
    void loadContext();
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          Resolving pull request workspace
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Could not load pull requests</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return <ProjectPullRequestsView repo={state.repo} />;
}
