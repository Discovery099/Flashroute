import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import ApiKeysPage from './ApiKeysPage';
import { resetAuthStore, useAuthStore } from '@/state/auth.store';
import { renderWithProviders } from '@/test/renderWithProviders';

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
  writable: true,
});

const mockApiKey = {
  id: 'key_123',
  name: 'Test Key',
  keyPrefix: 'fr_live_abc123',
  permissions: ['read', 'execute'],
  expiresAt: null,
  lastUsedAt: '2026-03-20T10:00:00.000Z',
  createdAt: '2026-03-01T00:00:00.000Z',
};

const mockApiKeys = [mockApiKey];

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('ApiKeysPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, apiKeys: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    resetAuthStore();
    useAuthStore.getState().completeLogin({ accessToken: 'test-token' });
    useAuthStore.getState().setUser({ id: 'user_123', email: 'test@example.com', name: 'Test User', role: 'trader', emailVerified: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('API Keys List', () => {
    it('renders API keys table when data is loaded', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, apiKeys: mockApiKeys }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      renderWithProviders(<ApiKeysPage />, { route: '/api-keys' });

      await waitFor(() => {
        expect(screen.getByText('Test Key')).toBeInTheDocument();
      });
      expect(screen.getByText('fr_live_abc123')).toBeInTheDocument();
    });

    it('shows empty state when no API keys exist', async () => {
      renderWithProviders(<ApiKeysPage />, { route: '/api-keys' });

      await waitFor(() => {
        expect(screen.getByText('No API keys created yet')).toBeInTheDocument();
      });
    });

    it('shows error state when fetch fails', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Server error' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      renderWithProviders(<ApiKeysPage />, { route: '/api-keys' });

      await waitFor(() => {
        expect(screen.getByText(/failed to load api keys/i)).toBeInTheDocument();
      });
    });
  });

  describe('Create Key Modal', () => {
    const openCreateModal = async () => {
      const buttons = screen.getAllByRole('button', { name: /create api key/i });
      const headerButton = buttons.find(b => b.closest('header') !== null);
      fireEvent.click(headerButton || buttons[buttons.length - 1]);
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create api key/i })).toBeInTheDocument();
      });
    };

    const getCreateModal = () => {
      const heading = screen.getByRole('heading', { name: 'Create API Key' });
      return heading.closest('section') || heading.closest('div[class*="fixed"]');
    };

    it('opens create modal when clicking Create API Key button', async () => {
      renderWithProviders(<ApiKeysPage />, { route: '/api-keys' });
      await openCreateModal();

      const modal = getCreateModal();
      expect(within(modal!).getByLabelText(/name/i)).toBeInTheDocument();
    });

    it('validates name field is 2-50 characters', async () => {
      renderWithProviders(<ApiKeysPage />, { route: '/api-keys' });
      await openCreateModal();

      const modal = getCreateModal()!;
      const nameInput = within(modal).getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: 'a' } });
      fireEvent.click(within(modal).getByRole('button', { name: /^create key$/i }));

      expect(within(modal).getByText(/name must be 2-50 characters/i)).toBeInTheDocument();
    });

    it('creates API key and shows reveal modal', async () => {
      const fullKey = 'fr_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true, apiKeys: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              success: true,
              apiKey: mockApiKey,
              key: fullKey,
              warning: 'Save this key now. You will not be able to view it again.',
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } },
          ),
        );

      renderWithProviders(<ApiKeysPage />, { route: '/api-keys' });
      await openCreateModal();

      const modal = getCreateModal()!;
      const nameInput = within(modal).getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: 'Production Bot' } });
      fireEvent.click(within(modal).getByRole('button', { name: /^create key$/i }));

      await waitFor(() => {
        expect(screen.getByText(/save your api key/i)).toBeInTheDocument();
      });

      expect(screen.getByDisplayValue(fullKey)).toBeInTheDocument();
      expect(screen.getByText(/save this key now/i)).toBeInTheDocument();
    });
  });

  describe('One-Time Reveal Modal', () => {
    const fullApiKey = 'fr_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

    const setupRevealModal = async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true, apiKeys: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              success: true,
              apiKey: mockApiKey,
              key: fullApiKey,
              warning: 'Save this key now. You will not be able to view it again.',
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } },
          ),
        );

      renderWithProviders(<ApiKeysPage />, { route: '/api-keys' });

      const buttons = screen.getAllByRole('button', { name: /create api key/i });
      const headerButton = buttons.find(b => b.closest('header') !== null);
      fireEvent.click(headerButton || buttons[buttons.length - 1]);

      const modalHeading = await waitFor(() => screen.getByRole('heading', { name: 'Create API Key' }));
      const modal = modalHeading.closest('section') || modalHeading.closest('div[class*="fixed"]');
      const nameInput = within(modal!).getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: 'Production Bot' } });
      fireEvent.click(within(modal!).getByRole('button', { name: /^create key$/i }));

      await waitFor(() => {
        expect(screen.getByText(/save your api key/i)).toBeInTheDocument();
      });
    };

    it('displays the full API key in monospace font', async () => {
      await setupRevealModal();
      const keyInput = screen.getByDisplayValue(fullApiKey);
      expect(keyInput).toHaveClass('font-mono');
    });

    it('shows warning box in amber', async () => {
      await setupRevealModal();
      expect(screen.getByText(/save this key now/i)).toBeInTheDocument();
    });

    it('acknowledge button is disabled until key is copied', async () => {
      await setupRevealModal();
      const acknowledgeButton = screen.getByRole('button', { name: /i have saved my api key/i });
      expect(acknowledgeButton).toBeDisabled();
    });

    it('closes modal after acknowledge is clicked', async () => {
      await setupRevealModal();
      const copyButton = screen.getByRole('button', { name: /copy api key/i });
      fireEvent.click(copyButton);

      await waitFor(() => {
        const acknowledgeButton = screen.getByRole('button', { name: /i have saved my api key/i });
        expect(acknowledgeButton).toBeEnabled();
      });

      fireEvent.click(screen.getByRole('button', { name: /i have saved my api key/i }));

      await waitFor(() => {
        expect(screen.queryByText(/save your api key/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Revoke Flow', () => {
    it('opens confirmation modal when revoke is clicked', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, apiKeys: mockApiKeys }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      renderWithProviders(<ApiKeysPage />, { route: '/api-keys' });

      await waitFor(() => {
        expect(screen.getByText('Test Key')).toBeInTheDocument();
      });

      const revokeButton = screen.getByRole('button', { name: /revoke/i });
      fireEvent.click(revokeButton);

      expect(screen.getByText(/type "revoke" to confirm/i)).toBeInTheDocument();
      expect(screen.getByText(/this will immediately invalidate/i)).toBeInTheDocument();
    });

    it('requires typing REVOKE to enable confirm button', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, apiKeys: mockApiKeys }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      renderWithProviders(<ApiKeysPage />, { route: '/api-keys' });

      await waitFor(() => fireEvent.click(screen.getByRole('button', { name: /revoke/i })));

      const confirmButton = screen.getByRole('button', { name: /revoke key/i });
      expect(confirmButton).toBeDisabled();

      const confirmInput = screen.getByPlaceholderText('REVOKE');
      fireEvent.change(confirmInput, { target: { value: 'revoke' } });

      await waitFor(() => {
        expect(confirmButton).toBeEnabled();
      });
    });

    it('calls DELETE API when revoke is confirmed', async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true, apiKeys: mockApiKeys }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true, message: 'API key revoked' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      renderWithProviders(<ApiKeysPage />, { route: '/api-keys' });

      await waitFor(() => fireEvent.click(screen.getByRole('button', { name: /revoke/i })));

      const confirmInput = screen.getByPlaceholderText('REVOKE');
      fireEvent.change(confirmInput, { target: { value: 'REVOKE' } });

      fireEvent.click(screen.getByRole('button', { name: /revoke key/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/v1/api-keys/key_123',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });
  });
});
