import { useAuthStore } from '@/state/auth.store';

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class ApiRequestError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly fieldErrors: Record<string, string>;

  public constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.fieldErrors = Array.isArray(details)
      ? details.reduce<Record<string, string>>((accumulator, item) => {
          if (typeof item === 'object' && item !== null && 'field' in item && 'message' in item && typeof item.field === 'string' && typeof item.message === 'string') {
            accumulator[item.field] = item.message;
          }
          return accumulator;
        }, {})
      : {};
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export const toWebSocketUrl = (path: string, accessToken: string, searchParams?: Record<string, string | undefined | null>) => {
  const rawBase = (import.meta.env.VITE_WS_BASE_URL as string | undefined) ?? API_BASE_URL ?? '';
  const normalizedBase = rawBase.length === 0
    ? window.location.origin
    : rawBase.startsWith('http://') || rawBase.startsWith('https://') || rawBase.startsWith('ws://') || rawBase.startsWith('wss://')
      ? rawBase
      : window.location.origin;

  const url = new URL(path, normalizedBase.replace(/^http/, 'ws'));
  url.searchParams.set('token', accessToken);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
};

export const apiGet = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const accessToken = useAuthStore.getState().accessToken;
  return requestJson<T>(path, {
    ...init,
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });
};

const requestJson = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const accessToken = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.success) {
    throw new ApiRequestError(response.status, payload.error?.code ?? 'REQUEST_FAILED', payload.error?.message ?? 'Request failed', payload.error?.details);
  }

  return payload.data;
};

export const apiPost = <T>(path: string, body?: unknown) =>
  requestJson<T>(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const apiPatch = <T>(path: string, body?: unknown) =>
  requestJson<T>(path, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const apiDelete = <T>(path: string) =>
  requestJson<T>(path, {
    method: 'DELETE',
  });
