import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AppProviders } from '@/app/providers';
import { authApi, AuthApiError } from '@/features/auth/api';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { resetAuthStore } from '@/state/auth.store';

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

const renderAt = (path: string) => {
  render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/settings" element={<div>Settings page</div>} />
          <Route path="/dashboard" element={<div>Dashboard page</div>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
};

describe('LoginPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetAuthStore();
    vi.clearAllMocks();
    mockedAuthApi.refreshSession.mockRejectedValue(new AuthApiError(401, 'UNAUTHORIZED', 'Invalid refresh token'));
  });

  it('renders the sign-in form at /login', async () => {
    renderAt('/login');

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  }, 15000);

  it('toggles password visibility from the login form', async () => {
    const user = userEvent.setup();
    renderAt('/login');

    const passwordInput = await screen.findByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  }, 15000);

  it('redirects to redirectTo after a successful login', async () => {
    const user = userEvent.setup();
    renderAt('/login?redirectTo=%2Fsettings');

    mockedAuthApi.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
    });
    mockedAuthApi.getCurrentUser.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'jane@flashroute.test',
        name: 'Jane',
        role: 'monitor',
        emailVerified: true,
      },
    });

    await screen.findByRole('heading', { name: /sign in/i });
    await user.type(screen.getByLabelText(/email/i), 'jane@flashroute.test');
    await user.type(screen.getByLabelText(/^password$/i), 'StrongP@ss1');
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }).closest('form')!);

    await waitFor(() => {
      expect(mockedAuthApi.login).toHaveBeenCalled();
    });

    expect(mockedAuthApi.login.mock.calls[0]?.[0]).toEqual({
      email: 'jane@flashroute.test',
      password: 'StrongP@ss1',
      rememberDevice: false,
    });

    expect(await screen.findByText(/settings page/i)).toBeInTheDocument();
  }, 30000);

  it('transitions into the 2FA challenge when the API requires it', async () => {
    const user = userEvent.setup();
    renderAt('/login');

    mockedAuthApi.login.mockRejectedValue(
      new AuthApiError(401, 'TWO_FACTOR_REQUIRED', 'Authentication challenge required', {
        requiresTwoFactor: true,
        challengeToken: 'challenge-token-123',
      }),
    );

    await screen.findByRole('heading', { name: /sign in/i });
    await user.type(screen.getByLabelText(/email/i), 'jane@flashroute.test');
    await user.type(screen.getByLabelText(/^password$/i), 'StrongP@ss1');
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }).closest('form')!);

    await waitFor(() => {
      expect(mockedAuthApi.login).toHaveBeenCalled();
    });

    expect((await screen.findAllByText(/two-factor authentication required/i, {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    expect(await screen.findByLabelText(/totp code/i, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
  }, 30000);

  it('submits the challenge token and totp code without resending the password', async () => {
    const user = userEvent.setup();
    renderAt('/login');

    mockedAuthApi.login
      .mockRejectedValueOnce(
        new AuthApiError(401, 'TWO_FACTOR_REQUIRED', 'Authentication challenge required', {
          requiresTwoFactor: true,
          challengeToken: 'challenge-token-456',
        }),
      )
      .mockResolvedValueOnce({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      });
    mockedAuthApi.getCurrentUser.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'jane@flashroute.test',
        name: 'Jane',
        role: 'monitor',
        emailVerified: true,
      },
    });

    await screen.findByRole('heading', { name: /sign in/i });
    await user.type(screen.getByLabelText(/email/i), 'jane@flashroute.test');
    await user.type(screen.getByLabelText(/^password$/i), 'StrongP@ss1');
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }).closest('form')!);

    expect(await screen.findByLabelText(/totp code/i, {}, { timeout: 5000 })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/totp code/i), '123456');
    fireEvent.submit(screen.getByRole('button', { name: /verify and sign in/i }).closest('form')!);

    await waitFor(() => {
      expect(mockedAuthApi.login).toHaveBeenCalledTimes(2);
    });

    expect(mockedAuthApi.login.mock.calls[1]?.[0]).toEqual({
      email: 'jane@flashroute.test',
      challengeToken: 'challenge-token-456',
      totpCode: '123456',
    });
  }, 30000);

  it('uses stable lockout contract fields instead of parsing message strings', async () => {
    const user = userEvent.setup();
    renderAt('/login');

    mockedAuthApi.login.mockRejectedValue(
      new AuthApiError(401, 'ACCOUNT_LOCKED', 'Unauthorized', {
        lockedUntil: '2026-03-22T12:00:00.000Z',
      }),
    );

    await screen.findByRole('heading', { name: /sign in/i });
    await user.type(screen.getByLabelText(/email/i), 'jane@flashroute.test');
    await user.type(screen.getByLabelText(/^password$/i), 'StrongP@ss1');
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }).closest('form')!);

    expect(await screen.findByText(/2026-03-22T12:00:00.000Z/i, {}, { timeout: 5000 })).toBeInTheDocument();
  }, 30000);
});
