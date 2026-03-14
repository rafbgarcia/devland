import './styles/global.css';

import { ConvexProvider } from 'convex/react';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { Provider as JotaiProvider } from 'jotai';

import { appJotaiStore } from '@/renderer/lib/jotai-store';
import { TooltipProvider } from '@/shadcn/components/ui/tooltip';
import { convex } from '@/renderer/lib/convex';

import { routeTree } from './routeTree.gen';

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  return (
    <JotaiProvider store={appJotaiStore}>
      <ConvexProvider client={convex}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </ConvexProvider>
    </JotaiProvider>
  );
}
