import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren, ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { createAppQueryClient } from '@/app/providers';

type RenderWithProvidersOptions = {
  route?: string;
};

export const renderWithProviders = (
  ui: ReactElement,
  { route = '/' }: RenderWithProvidersOptions = {},
) => {
  const queryClient = createAppQueryClient();

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return {
    queryClient,
    ...render(ui, { wrapper: Wrapper }),
  };
};
