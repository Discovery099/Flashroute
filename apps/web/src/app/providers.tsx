import { QueryCache, QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import { useUiStore } from '../state/ui.store';

const buildToast = (message: string) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: 'Network notice',
  description: message,
  tone: 'warning' as const,
});

const shouldRetry = (failureCount: number, error: unknown) => {
  const status = typeof error === 'object' && error !== null && 'statusCode' in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : undefined;

  if (status === 401 || status === 403 || status === 422) {
    return false;
  }

  return failureCount < 1;
};

export const createAppQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        useUiStore.getState().pushToast(
          buildToast(error instanceof Error ? error.message : 'Unable to refresh live data.'),
        );
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        useUiStore.getState().pushToast(
          buildToast(error instanceof Error ? error.message : 'The latest action could not be completed.'),
        );
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 300_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: false,
      },
    },
  });

const queryClient = createAppQueryClient();

export function AppProviders({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
