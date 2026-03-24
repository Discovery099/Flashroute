import { create } from 'zustand';

export type LiveConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

type LiveState = {
  connectionStatus: LiveConnectionStatus;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  latencyMs: number | null;
  subscribedChannels: string[];
  missedHeartbeatCount: number;
  connectionBannerDismissed: boolean;
  setConnectionStatus: (status: LiveConnectionStatus) => void;
  registerChannel: (channel: string) => void;
  unregisterChannel: (channel: string) => void;
  setLatency: (latencyMs: number | null) => void;
  recordMessageReceived: () => void;
  resetConnectionMetrics: () => void;
  setConnectionBannerDismissed: (dismissed: boolean) => void;
};

export const useLiveStore = create<LiveState>()((set) => ({
  connectionStatus: 'disconnected',
  lastConnectedAt: null,
  lastMessageAt: null,
  latencyMs: null,
  subscribedChannels: [],
  missedHeartbeatCount: 0,
  connectionBannerDismissed: false,
  setConnectionStatus: (status) =>
    set(() => ({
      connectionStatus: status,
      lastConnectedAt: status === 'connected' ? new Date().toISOString() : null,
    })),
  registerChannel: (channel) =>
    set((state) => ({
      subscribedChannels: state.subscribedChannels.includes(channel)
        ? state.subscribedChannels
        : [...state.subscribedChannels, channel],
    })),
  unregisterChannel: (channel) =>
    set((state) => ({ subscribedChannels: state.subscribedChannels.filter((entry) => entry !== channel) })),
  setLatency: (latencyMs) => set({ latencyMs }),
  recordMessageReceived: () => set({ lastMessageAt: new Date().toISOString(), missedHeartbeatCount: 0 }),
  resetConnectionMetrics: () => set({ latencyMs: null, lastMessageAt: null, missedHeartbeatCount: 0 }),
  setConnectionBannerDismissed: (dismissed) => set({ connectionBannerDismissed: dismissed }),
}));
