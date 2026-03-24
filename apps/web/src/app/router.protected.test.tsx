import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { AppProviders } from './providers';
import { ProtectedRouteFrame, PublicAuthPage } from './router';
import { authApi, AuthApiError } from '@/features/auth/api';
import { resetAuthStore, useAuthStore } from '@/state/auth.store';

vi.mock('@/features/auth/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/auth/api')>('@/features/auth/api');

  return {
    ...actual,
    authApi: {
      login: vi.fn(),
      register: vi.fn(),
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      verifyEmail: vi.fn(),
      refreshSession: vi.fn(),
      getCurrentUser: vi.fn(),
    },
  };
});

const mockedAuthApi = vi.mocked(authApi);

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

const renderAt = (path: string) => {
  render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<><h1>Sign in</h1><LocationProbe /></>} />
          <Route path="/verify-email" element={<PublicAuthPage allowWhenAuthenticated><><h1>Verify email</h1><LocationProbe /></></PublicAuthPage>} />
          <Route element={<ProtectedRouteFrame />}>
            <Route path="/dashboard" element={<><h1>Dashboard</h1><LocationProbe /></>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
};

describe('protected routing', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetAuthStore();
    vi.clearAllMocks();
  });

  it('redirects unauthenticated users to login and preserves redirectTo', async () => {
    mockedAuthApi.refreshSession.mockRejectedValue(new AuthApiError(401, 'UNAUTHORIZED', 'Invalid refresh token'));
    renderAt('/dashboard');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/login?redirectTo=%2Fdashboard');
    }, { timeout: 5000 });
  });

  it('holds protected content behind bootstrap and avoids a login-page flash when refresh succeeds', async () => {
    let resolveRefresh: ((value: { accessToken: string; refreshToken?: string; expiresIn: number }) => void) | undefined;
    mockedAuthApi.refreshSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    mockedAuthApi.getCurrentUser.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'jane@flashroute.test',
        name: 'Jane',
        role: 'monitor',
        emailVerified: true,
      },
    });

    renderAt('/dashboard');

    expect(screen.getByText(/checking your flashroute session/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /sign in/i })).not.toBeInTheDocument();

    if (resolveRefresh) {
      resolveRefresh({
        accessToken: 'access-token',
        refreshToken: 'rotated-refresh-token',
        expiresIn: 900,
      });
    }

    expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('does not clear the current auth state on transient bootstrap failures', async () => {
    useAuthStore.getState().setAccessToken('existing-access-token');
    mockedAuthApi.refreshSession.mockRejectedValue(new AuthApiError(503, 'INTERNAL_ERROR', 'Temporary outage'));

    renderAt('/dashboard');

    expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBe('existing-access-token');
    expect(useAuthStore.getState().logoutReason).toBeNull();
  });

  it('allows verify-email token routes to render for authenticated users', async () => {
    useAuthStore.getState().setAccessToken('existing-access-token');
    renderAt('/verify-email?token=abc123');

    expect(await screen.findByRole('heading', { name: /verify email/i })).toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/verify-email?token=abc123');
  });
});
