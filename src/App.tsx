import './styles/global.css';

import { createRouter, RouterProvider } from '@tanstack/react-router';

import { TooltipProvider } from '@/shadcn/components/ui/tooltip';

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
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
}
