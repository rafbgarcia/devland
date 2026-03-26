import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import type { DevlandRepoContext } from '@devlandapp/sdk';

import { ProjectIssuesView } from '@/components/project-issues-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { getExtensionContext, subscribeToExtensionContext } from '@/lib/devland';

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
    const unsubscribe = subscribeToExtensionContext((context) => {
      setState({
        status: 'ready',
        repo: context.repo,
        error: null,
      });
    });

    void loadContext();

    return unsubscribe;
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          Resolving issues workspace
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Could not load issues</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="h-full origin-center"
    >
      <ProjectIssuesView repo={state.repo} />
    </motion.div>
  );
}
