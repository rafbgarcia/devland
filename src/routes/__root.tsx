import { Outlet, createRootRoute } from '@tanstack/react-router';

import { OnboardingPrerequisitesPage } from '@/renderer/components/onboarding-prerequisites-page';

export const Route = createRootRoute({
  loader: () => window.electronAPI.getAppBootstrap(),
  pendingComponent: StartupLoadingRoute,
  component: RootRouteShell,
});

function RootRouteShell() {
  const { ghUser } = Route.useLoaderData();

  if (ghUser === null) {
    return <OnboardingPrerequisitesPage user={ghUser} />;
  }

  return <Outlet />;
}

function StartupLoadingRoute() {
  return (
    <>
      Loading
    </>
  );
}
