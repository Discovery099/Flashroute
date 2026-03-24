import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type BannerConfig = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  description: string;
};

export type ToastItem = {
  id: string;
  title: string;
  description?: string;
  tone: 'info' | 'warning' | 'success' | 'error';
};

type UiState = {
  sidebarCollapsed: boolean;
  currentModal: null | { type: string; payload?: unknown };
  commandPaletteOpen: boolean;
  mobileNavOpen: boolean;
  globalBanner: BannerConfig | null;
  toasts: ToastItem[];
  toggleSidebar: () => void;
  openModal: (type: string, payload?: unknown) => void;
  closeModal: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleMobileNav: () => void;
  pushToast: (toast: ToastItem) => void;
  removeToast: (id: string) => void;
  setBanner: (banner: BannerConfig | null) => void;
  dismissBanner: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      currentModal: null,
      commandPaletteOpen: false,
      mobileNavOpen: false,
      globalBanner: null,
      toasts: [],
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      openModal: (type, payload) => set({ currentModal: { type, payload } }),
      closeModal: () => set({ currentModal: null }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      toggleMobileNav: () => set((state) => ({ mobileNavOpen: !state.mobileNavOpen })),
      pushToast: (toast) => set((state) => ({ toasts: [...state.toasts, toast].slice(-5) })),
      removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
      setBanner: (banner) => set({ globalBanner: banner }),
      dismissBanner: () => set({ globalBanner: null }),
    }),
    {
      name: 'flashroute-ui-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
