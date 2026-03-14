import { ConvexReactClient } from 'convex/react';

const convexUrl = document
  .querySelector('meta[name="convex-url"]')
  ?.getAttribute('content');

if (!convexUrl) {
  throw new Error('VITE_CONVEX_URL is required to connect to Convex.');
}

export const convex = new ConvexReactClient(convexUrl);
