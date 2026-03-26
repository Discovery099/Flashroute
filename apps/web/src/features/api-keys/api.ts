import { useMutation, useQuery } from '@tanstack/react-query';

export type ApiKeyDTO = {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export type CreateApiKeyInput = {
  name: string;
  permissions?: string[];
  expiresAt?: string;
};

export type CreateApiKeyResponse = {
  apiKey: ApiKeyDTO;
  key: string;
  warning: string;
};

export type UpdateApiKeyInput = {
  name?: string;
  permissions?: string[];
  expiresAt?: string;
};

export const useApiKeys = () =>
  useQuery<ApiKeyDTO[]>({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const response = await fetch('/api/v1/api-keys', { credentials: 'include' });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? 'Failed to fetch API keys');
      }
      return payload.apiKeys;
    },
  });

export const useCreateApiKey = () =>
  useMutation<CreateApiKeyResponse, Error, CreateApiKeyInput>({
    mutationFn: async (input: CreateApiKeyInput) => {
      const response = await fetch('/api/v1/api-keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? 'Failed to create API key');
      }
      return payload;
    },
  });

export const useUpdateApiKey = () =>
  useMutation<void, Error, { id: string; updates: UpdateApiKeyInput }>({
    mutationFn: async ({ id, updates }) => {
      const response = await fetch(`/api/v1/api-keys/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? 'Failed to update API key');
      }
    },
  });

export const useDeleteApiKey = () =>
  useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v1/api-keys/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? 'Failed to revoke API key');
      }
    },
  });
