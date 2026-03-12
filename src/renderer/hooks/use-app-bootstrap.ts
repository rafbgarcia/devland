import { getRouteApi } from '@tanstack/react-router';

const rootRouteApi = getRouteApi('__root__');

export const useAppBootstrap = () => rootRouteApi.useLoaderData();
