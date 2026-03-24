export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  twoFactorEnabled?: boolean;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user?: AuthUser;
};

export type AuthErrorDetails = {
  fieldErrors?: AuthErrorFieldMap;
  requiresTwoFactor?: boolean;
  challengeToken?: string;
  lockedUntil?: string;
  retryAfter?: number;
};

export type LoginInput = {
  email: string;
  password?: string;
  rememberDevice?: boolean;
  totpCode?: string;
  challengeToken?: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

export type ForgotPasswordInput = {
  email: string;
};

export type ResetPasswordInput = {
  token: string;
  password: string;
};

export type VerifyEmailInput = {
  token: string;
};

export type AuthErrorFieldMap = Record<string, string>;

type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type ApiSuccess<T> = {
  success: true;
  data: T;
};

export class AuthApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: AuthErrorDetails;
  public readonly fieldErrors: AuthErrorFieldMap;
  public readonly requiresTwoFactor: boolean;
  public readonly challengeToken: string | null;
  public readonly lockedUntil: string | null;

  public constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AuthApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = toAuthErrorDetails(details);
    this.fieldErrors = this.details.fieldErrors ?? {};
    this.requiresTwoFactor = this.details.requiresTwoFactor ?? false;
    this.challengeToken = this.details.challengeToken ?? null;
    this.lockedUntil = this.details.lockedUntil ?? null;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

const jsonHeaders = {
  'content-type': 'application/json',
};

const normalizeFieldErrors = (details: unknown): AuthErrorFieldMap => {
  if (Array.isArray(details)) {
    return details.reduce<AuthErrorFieldMap>((accumulator, item) => {
      if (
        typeof item === 'object' &&
        item !== null &&
        'field' in item &&
        'message' in item &&
        typeof item.field === 'string' &&
        typeof item.message === 'string'
      ) {
        accumulator[item.field] = item.message;
      }

      return accumulator;
    }, {});
  }

  if (typeof details === 'object' && details !== null) {
    return Object.entries(details).reduce<AuthErrorFieldMap>((accumulator, [field, value]) => {
      if (typeof value === 'string') {
        accumulator[field] = value;
      }

      return accumulator;
    }, {});
  }

  return {};
};

const toAuthErrorDetails = (details: unknown): AuthErrorDetails => {
  if (typeof details !== 'object' || details === null) {
    return {};
  }

  const errorDetails = details as Record<string, unknown>;
  const fieldErrors = 'fieldErrors' in errorDetails
    ? normalizeFieldErrors(errorDetails.fieldErrors)
    : normalizeFieldErrors(details);

  return {
    fieldErrors,
    requiresTwoFactor: errorDetails.requiresTwoFactor === true,
    challengeToken: typeof errorDetails.challengeToken === 'string' ? errorDetails.challengeToken : undefined,
    lockedUntil: typeof errorDetails.lockedUntil === 'string' ? errorDetails.lockedUntil : undefined,
    retryAfter: typeof errorDetails.retryAfter === 'number' ? errorDetails.retryAfter : undefined,
  };
};

const requestJson = async <T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...jsonHeaders,
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;

  if (!response.ok || !payload.success) {
    if ('error' in payload) {
      throw new AuthApiError(response.status, payload.error.code, payload.error.message, payload.error.details);
    }

    throw new AuthApiError(response.status, 'INTERNAL_ERROR', 'Unexpected server error');
  }

  return payload.data;
};

export const sanitizeRedirectTo = (value: string | null | undefined) => {
  if (!value || !value.startsWith('/')) {
    return null;
  }

  if (value.startsWith('//') || value.includes('://')) {
    return null;
  }

  return value;
};

export const maskEmail = (email: string) => {
  const [localPart, domain = ''] = email.split('@');

  if (!localPart || !domain) {
    return email;
  }

  return `${localPart.slice(0, 1)}***@${domain}`;
};

export const authApi = {
  login: (input: LoginInput) =>
    requestJson<AuthTokens>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  register: (input: RegisterInput) =>
    requestJson<{ user: AuthUser; message: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  forgotPassword: (input: ForgotPasswordInput) =>
    requestJson<{ message: string }>('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  resetPassword: (input: ResetPasswordInput) =>
    requestJson<{ message: string }>('/api/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  verifyEmail: (input: VerifyEmailInput) =>
    requestJson<{ message: string }>('/api/v1/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  refreshSession: () =>
    requestJson<AuthTokens>('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  getCurrentUser: (accessToken: string) =>
    requestJson<{ user: AuthUser }>('/api/v1/users/me', {
      method: 'GET',
    }, accessToken),
};
