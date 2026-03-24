import { create } from 'zustand';

import { authApi } from '@/features/auth/api';

export type LogoutReason = 'manual' | 'expired' | 'revoked' | null;

type AuthState = {
  accessToken: string | null;
  refreshInFlight: boolean;
  isBootstrapping: boolean;
  isAuthenticated: boolean;
  postLoginRedirect: string | null;
  logoutReason: LogoutReason;
  setAccessToken: (token: string | null) => void;
  beginBootstrap: () => void;
  finishBootstrap: (authenticated: boolean) => void;
  setPostLoginRedirect: (path: string | null) => void;
  clearPostLoginRedirect: () => void;
  markRefreshInFlight: (flag: boolean) => void;
  completeLogin: (tokens: { accessToken: string }) => void;
  logout: (reason?: LogoutReason) => void;
  reset: () => void;
};

const REDIRECT_KEY = 'flashroute.post-login-redirect';

const readSessionValue = (key: string) => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.sessionStorage.getItem(key);
};

const writeSessionValue = (key: string, value: string | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (value) {
    window.sessionStorage.setItem(key, value);
    return;
  }

  window.sessionStorage.removeItem(key);
};

const getInitialState = () => {
  const postLoginRedirect = readSessionValue(REDIRECT_KEY);

  return {
    accessToken: null,
    refreshInFlight: false,
    isBootstrapping: true,
    isAuthenticated: false,
    postLoginRedirect,
    logoutReason: null,
  };
};

export const useAuthStore = create<AuthState>((set) => ({
  ...getInitialState(),
  setAccessToken: (token) => set({ accessToken: token, isAuthenticated: Boolean(token) }),
  beginBootstrap: () => set({ isBootstrapping: true }),
  finishBootstrap: (authenticated) => set({ isBootstrapping: false, isAuthenticated: authenticated }),
  setPostLoginRedirect: (path) => {
    writeSessionValue(REDIRECT_KEY, path);
    set({ postLoginRedirect: path });
  },
  clearPostLoginRedirect: () => {
    writeSessionValue(REDIRECT_KEY, null);
    set({ postLoginRedirect: null });
  },
  markRefreshInFlight: (flag) => set({ refreshInFlight: flag }),
  completeLogin: ({ accessToken }) => {
    set({
      accessToken,
      isAuthenticated: true,
      logoutReason: null,
      isBootstrapping: false,
    });
  },
  logout: (reason = 'manual') => {
    writeSessionValue(REDIRECT_KEY, null);
    set({
      accessToken: null,
      refreshInFlight: false,
      isAuthenticated: false,
      isBootstrapping: false,
      postLoginRedirect: null,
      logoutReason: reason,
    });
  },
  reset: () => {
    writeSessionValue(REDIRECT_KEY, null);
    set(getInitialState());
  },
}));

let bootstrapPromise: Promise<boolean> | null = null;

export const bootstrapAuthSession = async () => {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    const store = useAuthStore.getState();
    const accessToken = store.accessToken;

    store.beginBootstrap();

    store.markRefreshInFlight(true);

    try {
      const refreshed = await authApi.refreshSession();
      store.completeLogin({
        accessToken: refreshed.accessToken,
      });
      await authApi.getCurrentUser(refreshed.accessToken);
      store.finishBootstrap(true);
      return true;
    } catch (error) {
      if (error instanceof Error && 'statusCode' in error) {
        const statusCode = Number((error as { statusCode?: unknown }).statusCode);

        if (statusCode === 401 || statusCode === 403) {
          store.logout('expired');
          return false;
        }
      }

      store.finishBootstrap(Boolean(accessToken));
      return Boolean(accessToken);
    } finally {
      store.markRefreshInFlight(false);
      bootstrapPromise = null;
    }
  })();

  return bootstrapPromise;
};

export const resetAuthStore = () => {
  bootstrapPromise = null;
  useAuthStore.getState().reset();
};
