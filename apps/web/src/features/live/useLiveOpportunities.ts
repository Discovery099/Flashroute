import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getOpportunities, type OpportunityApiItem } from '@/features/opportunities/api';
import { getOpportunityRouteLabel, toOpportunityItem, type OpportunityItem } from '@/features/opportunities/types';
import { toWebSocketUrl } from '@/lib/api';
import { useAuthStore } from '@/state/auth.store';
import { useLiveStore } from '@/state/live.store';

const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;
const HIGHLIGHT_MS = 2_500;
const EXPIRE_FADE_MS = 300;

const opportunitiesKey = (chainId: number, minProfitUsd: number) => ['opportunities', { chainId, minProfitUsd }] as const;

const pruneExpired = (items: OpportunityItem[], now: number) => items.filter((item) => item.expiresAt > now);

const upsertOpportunity = (items: OpportunityItem[], incoming: OpportunityApiItem, now: number) => {
  const nextItem = toOpportunityItem(incoming, now);
  const remaining = items.filter((item) => item.id !== incoming.id && item.expiresAt > now);
  return [nextItem, ...remaining];
};

export const useLiveOpportunities = ({
  chainId,
  minProfitUsd,
  paused,
}: {
  chainId: number;
  minProfitUsd: number;
  paused: boolean;
}) => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [highlightedIds, setHighlightedIds] = useState<Record<string, boolean>>({});
  const [bufferedItems, setBufferedItems] = useState<OpportunityApiItem[]>([]);
  const [staleSince, setStaleSince] = useState<string | null>(useLiveStore.getState().lastMessageAt);
  const [expiringIds, setExpiringIds] = useState<Record<string, boolean>>({});
  const pausedRef = useRef(paused);
  const reconnectTimerRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const connectionIdRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const highlightTimersRef = useRef(new Map<string, number>());
  const expiryTimersRef = useRef(new Map<string, number>());
  const connectionStatus = useLiveStore((state) => state.connectionStatus);

  const registerChannel = useLiveStore((state) => state.registerChannel);
  const unregisterChannel = useLiveStore((state) => state.unregisterChannel);
  const setConnectionStatus = useLiveStore((state) => state.setConnectionStatus);
  const recordMessageReceived = useLiveStore((state) => state.recordMessageReceived);
  const resetConnectionMetrics = useLiveStore((state) => state.resetConnectionMetrics);

  const channel = `opportunities:${chainId}`;
  const query = useQuery({
    queryKey: opportunitiesKey(chainId, minProfitUsd),
    queryFn: async () => {
      const result = await getOpportunities({ chainId, minProfitUsd });
      return result.opportunities.map((item) => toOpportunityItem(item));
    },
    staleTime: 3_000,
    refetchInterval: connectionStatus === 'connected' ? false : 15_000,
    retry: false,
  });

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const opportunities = useMemo(() => pruneExpired(query.data ?? [], Date.now()), [query.data]);
  const displayedOpportunities = useMemo(
    () => opportunities.map((item) => ({ ...item, isExpiring: expiringIds[item.id] ?? false })),
    [expiringIds, opportunities],
  );

  useEffect(() => {
    queryClient.setQueryData(opportunitiesKey(chainId, minProfitUsd), (current: OpportunityItem[] | undefined) => pruneExpired(current ?? [], Date.now()));
  }, [chainId, minProfitUsd, queryClient]);

  useEffect(() => {
    for (const timer of expiryTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    expiryTimersRef.current.clear();

    for (const item of opportunities) {
      const fadeTimer = window.setTimeout(() => {
        setExpiringIds((current) => ({ ...current, [item.id]: true }));
      }, Math.max(0, item.expiresAt - Date.now() - EXPIRE_FADE_MS));
      const removeTimer = window.setTimeout(() => {
        queryClient.setQueryData(opportunitiesKey(chainId, minProfitUsd), (current: OpportunityItem[] | undefined) =>
          pruneExpired(current ?? [], Date.now()),
        );
        setExpiringIds((current) => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
      }, Math.max(0, item.expiresAt - Date.now()));
      expiryTimersRef.current.set(`${item.id}:fade`, fadeTimer);
      expiryTimersRef.current.set(`${item.id}:remove`, removeTimer);
    }

    return () => {
      for (const timer of expiryTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      expiryTimersRef.current.clear();
    };
  }, [chainId, minProfitUsd, opportunities, queryClient]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;

    const scheduleReconnect = () => {
      if (!active) {
        return;
      }

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      const baseDelay = RECONNECT_DELAYS_MS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1)];
      const delay = baseDelay + Math.round(baseDelay * Math.random());
      reconnectAttemptRef.current += 1;

      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    };

    const applyIncoming = (incoming: OpportunityApiItem) => {
      if (pausedRef.current) {
        setBufferedItems((current) => {
          const deduped = current.filter((item) => item.id !== incoming.id);
          return [incoming, ...deduped];
        });
        return;
      }

      queryClient.setQueryData(opportunitiesKey(chainId, minProfitUsd), (current: OpportunityItem[] | undefined) =>
        upsertOpportunity(current ?? [], incoming, Date.now()),
      );
      setHighlightedIds((current) => ({ ...current, [incoming.id]: true }));
      const existingTimer = highlightTimersRef.current.get(incoming.id);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
      const timer = window.setTimeout(() => {
        setHighlightedIds((current) => ({ ...current, [incoming.id]: false }));
      }, HIGHLIGHT_MS);
      highlightTimersRef.current.set(incoming.id, timer);
    };

    const connect = () => {
      setConnectionStatus(socketRef.current ? 'reconnecting' : 'connecting');
      const socket = new WebSocket(
        toWebSocketUrl('/ws', accessToken, {
          resumeConnectionId: connectionIdRef.current,
        }),
      );
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        if (!active) {
          return;
        }
        setConnectionStatus('connecting');
      });

      socket.addEventListener('message', (event) => {
        if (!active) {
          return;
        }
        const payload = JSON.parse(String(event.data)) as {
          type: string;
          channel?: string;
          data?: OpportunityApiItem | { channels?: string[] };
        };

        recordMessageReceived();
        setStaleSince(new Date().toISOString());

        if (payload.type === 'connected') {
          const connectionData = payload.data as { connectionId?: string } | undefined;
          connectionIdRef.current = connectionData?.connectionId ?? connectionIdRef.current;
          reconnectAttemptRef.current = 0;
          setConnectionStatus('connected');
          socket.send(JSON.stringify({ type: 'subscribe', channels: [channel] }));
          registerChannel(channel);
          return;
        }

        if (payload.type === 'subscribed') {
          setConnectionStatus('connected');
          return;
        }

        if (payload.type === 'opportunity' && payload.channel === channel && payload.data) {
          applyIncoming(payload.data as OpportunityApiItem);
        }
      });

      socket.addEventListener('close', () => {
        if (!active) {
          return;
        }
        setConnectionStatus('disconnected');
        setStaleSince(useLiveStore.getState().lastMessageAt);
        scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        socket.close();
      });
    };

    connect();

    return () => {
      active = false;
      unregisterChannel(channel);
      resetConnectionMetrics();
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, [accessToken, chainId, channel, minProfitUsd, queryClient, recordMessageReceived, registerChannel, resetConnectionMetrics, setConnectionStatus, unregisterChannel]);

  const resumeBuffered = () => {
    const items = [...bufferedItems].reverse();
    setBufferedItems([]);
    for (const item of items) {
      queryClient.setQueryData(opportunitiesKey(chainId, minProfitUsd), (current: OpportunityItem[] | undefined) =>
        upsertOpportunity(current ?? [], item, Date.now()),
      );
      setHighlightedIds((current) => ({ ...current, [item.id]: true }));
      const timer = window.setTimeout(() => {
        setHighlightedIds((current) => ({ ...current, [item.id]: false }));
      }, HIGHLIGHT_MS);
      highlightTimersRef.current.set(item.id, timer);
    }
  };

  return {
    opportunities: displayedOpportunities.filter((item) => item.estimatedProfitUsd >= minProfitUsd),
    highlightedIds,
    bufferedCount: bufferedItems.length,
    resumeBuffered,
    isLoading: query.isLoading,
    isError: query.isError,
    retry: () => query.refetch(),
    isOffline: connectionStatus !== 'connected',
    staleSince,
    routeLabelFor: getOpportunityRouteLabel,
  };
};
