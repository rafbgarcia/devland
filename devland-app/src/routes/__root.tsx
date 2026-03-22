import { Outlet, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  loader: () => window.electronAPI.getAppBootstrap(),
  pendingComponent: StartupLoadingRoute,
  component: () => <Outlet />,
});

function StartupLoadingRoute() {
  return (
    <>
      Loading
    </>
  );
}
