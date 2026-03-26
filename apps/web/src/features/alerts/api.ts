import { useMutation, useQuery } from '@tanstack/react-query';

export type AlertType = 'opportunity_found' | 'trade_executed' | 'trade_failed' | 'profit_threshold' | 'gas_spike' | 'system_error';

export type DeliveryChannel = 'dashboard' | 'email' | 'telegram' | 'webhook';

export type AlertDTO = {
  id: string;
  type: AlertType;
  chainId?: number;
  strategyId?: string;
  thresholdValue?: number;
  deliveryChannel: DeliveryChannel[];
  deliveryConfig: {
    webhookUrl?: string;
    telegramChatId?: string;
  };
  cooldownSeconds: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type AlertHistoryDTO = {
  id: string;
  alertId: string;
  triggeredAt: string;
  payload: Record<string, unknown>;
  deliveredAt?: string;
  deliveryStatus: 'pending' | 'sent' | 'failed';
};

export type CreateAlertInput = {
  type: AlertType;
  chainId?: number;
  strategyId?: string;
  thresholdValue?: number;
  deliveryChannel: DeliveryChannel[];
  deliveryConfig?: {
    webhookUrl?: string;
    telegramChatId?: string;
  };
  cooldownSeconds?: number;
  isActive?: boolean;
};

export type UpdateAlertInput = Partial<Omit<CreateAlertInput, 'deliveryChannel'>> & {
  deliveryChannel?: DeliveryChannel[];
};

export const useAlerts = () =>
  useQuery<AlertDTO[]>({
    queryKey: ['alerts'],
    queryFn: async () => {
      const response = await fetch('/api/v1/alerts', { credentials: 'include' });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? 'Failed to fetch alerts');
      }
      return payload.alerts ?? [];
    },
  });

export const useCreateAlert = () =>
  useMutation<AlertDTO, Error, CreateAlertInput>({
    mutationFn: async (input: CreateAlertInput) => {
      const response = await fetch('/api/v1/alerts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? 'Failed to create alert');
      }
      return payload.alert;
    },
  });

export const useUpdateAlert = () =>
  useMutation<AlertDTO, Error, { id: string; updates: UpdateAlertInput }>({
    mutationFn: async ({ id, updates }) => {
      const response = await fetch(`/api/v1/alerts/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? 'Failed to update alert');
      }
      return payload.alert;
    },
  });

export const useDeleteAlert = () =>
  useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v1/alerts/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? 'Failed to delete alert');
      }
    },
  });

export const useAlertHistory = (alertId: string) =>
  useQuery<AlertHistoryDTO[]>({
    queryKey: ['alerts', alertId, 'history'],
    queryFn: async () => {
      const response = await fetch(`/api/v1/alerts/${alertId}/history`, { credentials: 'include' });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? 'Failed to fetch alert history');
      }
      return payload.history ?? [];
    },
    enabled: !!alertId,
  });

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  opportunity_found: 'Opportunity Found',
  trade_executed: 'Trade Executed',
  trade_failed: 'Trade Failed',
  profit_threshold: 'Profit Threshold',
  gas_spike: 'Gas Spike',
  system_error: 'System Error',
};

export const DELIVERY_CHANNEL_LABELS: Record<DeliveryChannel, string> = {
  dashboard: 'Dashboard',
  email: 'Email',
  telegram: 'Telegram',
  webhook: 'Webhook',
};
