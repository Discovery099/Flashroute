import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AppProviders } from '@/app/providers';
import { authApi } from '@/features/auth/api';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { VerifyEmailPage } from '@/features/auth/pages/VerifyEmailPage';
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

describe('RegisterPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetAuthStore();
    vi.clearAllMocks();
  });

  it('lands in the verification prompt state after successful registration', async () => {
    const user = userEvent.setup();

    mockedAuthApi.register.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'jane@flashroute.test',
        name: 'Jane',
        role: 'monitor',
        emailVerified: false,
      },
      message: 'Check your email to verify.',
    });

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/register']}>
          <Routes>
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Routes>
        </MemoryRouter>
      </AppProviders>,
    );

    await user.type(await screen.findByLabelText(/^name$/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/^email$/i), 'jane@flashroute.test');
    await user.type(screen.getByLabelText(/^password$/i), 'StrongP@ss1');
    await user.type(screen.getByLabelText(/confirm password/i), 'StrongP@ss1');
    await user.click(screen.getByRole('checkbox'));
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });

    fireEvent.submit(submitButton.closest('form')!);

    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
    expect(screen.getByText(/jane@flashroute.test/i)).toBeInTheDocument();
  }, 30000);
});
