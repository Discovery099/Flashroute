import { Button, Card } from '@flashroute/ui';
import { Bell, BellOff, Edit2, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { useAlerts, useCreateAlert, useDeleteAlert, useUpdateAlert, type AlertDTO, type CreateAlertInput, type UpdateAlertInput, ALERT_TYPE_LABELS, DELIVERY_CHANNEL_LABELS } from '../api';
import { STRATEGY_CHAIN_OPTIONS } from '@/features/strategies/config';

const ALERT_TYPES = [
  { value: 'opportunity_found', label: 'Opportunity Found' },
  { value: 'trade_executed', label: 'Trade Executed' },
  { value: 'trade_failed', label: 'Trade Failed' },
  { value: 'profit_threshold', label: 'Profit Threshold' },
  { value: 'gas_spike', label: 'Gas Spike' },
  { value: 'system_error', label: 'System Error' },
] as const;

const DELIVERY_CHANNELS = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'email', label: 'Email' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'webhook', label: 'Webhook' },
] as const;

type AlertFormData = {
  type: CreateAlertInput['type'];
  chainId?: number;
  strategyId?: string;
  thresholdValue?: number;
  deliveryChannel: CreateAlertInput['deliveryChannel'];
  deliveryConfig?: {
    webhookUrl?: string;
    telegramChatId?: string;
  };
  cooldownSeconds: number;
  isActive: boolean;
};

const defaultFormData: AlertFormData = {
  type: 'opportunity_found',
  chainId: undefined,
  strategyId: undefined,
  thresholdValue: undefined,
  deliveryChannel: ['dashboard'],
  deliveryConfig: {},
  cooldownSeconds: 60,
  isActive: true,
};

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function chainLabel(chainId: number | undefined) {
  if (!chainId) return 'All chains';
  return STRATEGY_CHAIN_OPTIONS.find((c) => c.value === chainId)?.label ?? `Chain ${chainId}`;
}

interface AlertModalProps {
  alert?: AlertDTO;
  onClose: () => void;
  onSuccess: () => void;
}

function AlertModal({ alert, onClose, onSuccess }: AlertModalProps) {
  const [formData, setFormData] = useState<AlertFormData>(() => {
    if (alert) {
      return {
        type: alert.type,
        chainId: alert.chainId,
        strategyId: alert.strategyId,
        thresholdValue: alert.thresholdValue,
        deliveryChannel: alert.deliveryChannel,
        deliveryConfig: alert.deliveryConfig ?? {},
        cooldownSeconds: alert.cooldownSeconds,
        isActive: alert.isActive,
      };
    }
    return defaultFormData;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();

  const isEditing = !!alert;
  const isPending = createAlert.isPending || updateAlert.isPending;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (formData.thresholdValue !== undefined && formData.thresholdValue <= 0) {
      newErrors.thresholdValue = 'Threshold must be a positive number';
    }

    if (formData.cooldownSeconds < 10) {
      newErrors.cooldownSeconds = 'Cooldown must be at least 10 seconds';
    }

    if (formData.deliveryChannel.length === 0) {
      newErrors.deliveryChannel = 'At least one delivery channel is required';
    }

    if (formData.deliveryChannel.includes('webhook') && !formData.deliveryConfig?.webhookUrl) {
      newErrors.webhookUrl = 'Webhook URL is required when webhook is selected';
    }

    if (formData.deliveryChannel.includes('telegram') && !formData.deliveryConfig?.telegramChatId) {
      newErrors.telegramChatId = 'Telegram Chat ID is required when telegram is selected';
    }

    if (formData.deliveryConfig?.webhookUrl) {
      try {
        new URL(formData.deliveryConfig.webhookUrl);
      } catch {
        newErrors.webhookUrl = 'Invalid URL format';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const input: CreateAlertInput | UpdateAlertInput = {
      type: formData.type,
      chainId: formData.chainId,
      strategyId: formData.strategyId,
      thresholdValue: formData.thresholdValue,
      deliveryChannel: formData.deliveryChannel,
      deliveryConfig:
        formData.deliveryChannel.includes('webhook') || formData.deliveryChannel.includes('telegram')
          ? formData.deliveryConfig
          : undefined,
      cooldownSeconds: formData.cooldownSeconds,
      isActive: formData.isActive,
    };

    try {
      if (isEditing) {
        const updateInput: UpdateAlertInput = {
          type: formData.type,
          chainId: formData.chainId,
          strategyId: formData.strategyId,
          thresholdValue: formData.thresholdValue,
          deliveryChannel: formData.deliveryChannel,
          deliveryConfig:
            formData.deliveryChannel.includes('webhook') || formData.deliveryChannel.includes('telegram')
              ? formData.deliveryConfig
              : undefined,
          cooldownSeconds: formData.cooldownSeconds,
          isActive: formData.isActive,
        };
        await updateAlert.mutateAsync({ id: alert.id, updates: updateInput });
      } else {
        const createInput: CreateAlertInput = {
          type: formData.type,
          chainId: formData.chainId,
          strategyId: formData.strategyId,
          thresholdValue: formData.thresholdValue,
          deliveryChannel: formData.deliveryChannel,
          deliveryConfig:
            formData.deliveryChannel.includes('webhook') || formData.deliveryChannel.includes('telegram')
              ? formData.deliveryConfig
              : undefined,
          cooldownSeconds: formData.cooldownSeconds,
          isActive: formData.isActive,
        };
        await createAlert.mutateAsync(createInput);
      }
      onSuccess();
    } catch {
      // mutation handles error via toast
    }
  };

  const handleChannelChange = (channel: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      deliveryChannel: checked
        ? [...prev.deliveryChannel, channel as CreateAlertInput['deliveryChannel'][number]]
        : prev.deliveryChannel.filter((c) => c !== channel),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="relative w-full max-w-lg p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-fx-text-muted hover:text-fx-text-primary"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-semibold">{isEditing ? 'Edit Alert' : 'Create Alert'}</h2>
        <p className="mt-1 text-sm text-fx-text-secondary">
          {isEditing ? 'Update your alert configuration.' : 'Configure a new notification alert.'}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-fx-text-primary" htmlFor="alert-type">
              Type <span className="text-red-400">*</span>
            </label>
            <select
              id="alert-type"
              value={formData.type}
              onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value as CreateAlertInput['type'] }))}
              className="mt-1 w-full rounded-2xl border border-fx-border bg-fx-bg px-4 py-3 text-sm text-fx-text-primary outline-none focus:border-cyan-400/60"
            >
              {ALERT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-fx-text-primary" htmlFor="alert-chain">
              Chain (optional)
            </label>
            <select
              id="alert-chain"
              value={formData.chainId ?? ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, chainId: e.target.value ? Number(e.target.value) : undefined }))}
              className="mt-1 w-full rounded-2xl border border-fx-border bg-fx-bg px-4 py-3 text-sm text-fx-text-primary outline-none focus:border-cyan-400/60"
            >
              <option value="">All chains</option>
              {STRATEGY_CHAIN_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-fx-text-primary" htmlFor="alert-threshold">
              Threshold (optional)
            </label>
            <input
              id="alert-threshold"
              type="number"
              step="any"
              min="0"
              value={formData.thresholdValue ?? ''}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  thresholdValue: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
              placeholder="e.g., 100.00"
              className="mt-1 w-full rounded-2xl border border-fx-border bg-fx-bg px-4 py-3 text-sm text-fx-text-primary outline-none focus:border-cyan-400/60"
            />
            {errors.thresholdValue && <p className="mt-1 text-sm text-red-300">{errors.thresholdValue}</p>}
          </div>

          <div>
            <span className="block text-sm font-medium text-fx-text-primary">
              Delivery Channels <span className="text-red-400">*</span>
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {DELIVERY_CHANNELS.map((channel) => (
                <label
                  key={channel.value}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-fx-border bg-fx-surface px-3 py-2 text-sm text-fx-text-secondary hover:border-cyan-400/40"
                >
                  <input
                    type="checkbox"
                    checked={formData.deliveryChannel.includes(channel.value as CreateAlertInput['deliveryChannel'][number])}
                    onChange={(e) => handleChannelChange(channel.value, e.target.checked)}
                    className="h-4 w-4 accent-cyan-400"
                  />
                  {channel.label}
                </label>
              ))}
            </div>
            {errors.deliveryChannel && <p className="mt-1 text-sm text-red-300">{errors.deliveryChannel}</p>}
          </div>

          {formData.deliveryChannel.includes('telegram') && (
            <div>
              <label className="block text-sm font-medium text-fx-text-primary" htmlFor="telegram-chat-id">
                Telegram Chat ID <span className="text-red-400">*</span>
              </label>
              <input
                id="telegram-chat-id"
                type="text"
                value={formData.deliveryConfig?.telegramChatId ?? ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    deliveryConfig: { ...prev.deliveryConfig, telegramChatId: e.target.value },
                  }))
                }
                placeholder="e.g., -1001234567890"
                className="mt-1 w-full rounded-2xl border border-fx-border bg-fx-bg px-4 py-3 text-sm text-fx-text-primary outline-none focus:border-cyan-400/60"
              />
              {errors.telegramChatId && <p className="mt-1 text-sm text-red-300">{errors.telegramChatId}</p>}
            </div>
          )}

          {formData.deliveryChannel.includes('webhook') && (
            <div>
              <label className="block text-sm font-medium text-fx-text-primary" htmlFor="webhook-url">
                Webhook URL <span className="text-red-400">*</span>
              </label>
              <input
                id="webhook-url"
                type="url"
                value={formData.deliveryConfig?.webhookUrl ?? ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    deliveryConfig: { ...prev.deliveryConfig, webhookUrl: e.target.value },
                  }))
                }
                placeholder="https://example.com/webhook"
                className="mt-1 w-full rounded-2xl border border-fx-border bg-fx-bg px-4 py-3 text-sm text-fx-text-primary outline-none focus:border-cyan-400/60"
              />
              {errors.webhookUrl && <p className="mt-1 text-sm text-red-300">{errors.webhookUrl}</p>}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-fx-text-primary" htmlFor="cooldown-seconds">
              Cooldown (seconds) <span className="text-red-400">*</span>
            </label>
            <input
              id="cooldown-seconds"
              type="number"
              min="10"
              value={formData.cooldownSeconds}
              onChange={(e) => setFormData((prev) => ({ ...prev, cooldownSeconds: Number(e.target.value) }))}
              className="mt-1 w-full rounded-2xl border border-fx-border bg-fx-bg px-4 py-3 text-sm text-fx-text-primary outline-none focus:border-cyan-400/60"
            />
            {errors.cooldownSeconds && <p className="mt-1 text-sm text-red-300">{errors.cooldownSeconds}</p>}
            <p className="mt-1 text-xs text-fx-text-muted">Minimum 10 seconds</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="is-active"
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
              className="h-4 w-4 accent-cyan-400"
            />
            <label htmlFor="is-active" className="text-sm font-medium text-fx-text-primary">
              Alert is active
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? (isEditing ? 'Saving...' : 'Creating...') : isEditing ? 'Save Changes' : 'Create Alert'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

interface DeleteConfirmModalProps {
  alert: AlertDTO;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ alert, onConfirm, onCancel }: DeleteConfirmModalProps) {
  const deleteAlert = useDeleteAlert();

  const handleConfirm = () => {
    deleteAlert.mutate(alert.id, {
      onSuccess: onConfirm,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md p-6">
        <h2 className="text-lg font-semibold">Delete Alert</h2>
        {alert.isActive ? (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm text-amber-200">
              <strong>This alert is active.</strong> Deleting it will stop all notifications.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-fx-text-secondary">
            This will permanently delete this alert configuration.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={deleteAlert.isPending}>
            {deleteAlert.isPending ? 'Deleting...' : 'Delete Alert'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <Card title="No alerts configured" subtitle="Get notified about important events in your trading operation.">
      <div className="mt-4 flex items-center gap-3">
        <BellOff className="h-8 w-8 text-fx-text-muted" />
        <p className="text-sm text-fx-text-secondary">
          Create your first alert to start receiving notifications.
        </p>
      </div>
      <div className="mt-6">
        <Button variant="primary" onClick={onCreateClick}>
          Create Alert
        </Button>
      </div>
    </Card>
  );
}

interface AlertRowProps {
  alert: AlertDTO;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

function AlertRow({ alert, onEdit, onDelete, onToggleActive }: AlertRowProps) {
  return (
    <tr className="text-sm">
      <td className="py-4 font-medium text-fx-text-primary">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-cyan-400" />
          {ALERT_TYPE_LABELS[alert.type]}
        </div>
      </td>
      <td className="py-4 text-fx-text-secondary">{chainLabel(alert.chainId)}</td>
      <td className="py-4">
        <div className="flex flex-wrap gap-1">
          {alert.deliveryChannel.map((channel) => (
            <span
              key={channel}
              className="rounded-full bg-fx-surface-strong px-2 py-0.5 text-xs text-fx-text-secondary"
            >
              {DELIVERY_CHANNEL_LABELS[channel]}
            </span>
          ))}
        </div>
      </td>
      <td className="py-4 text-fx-text-secondary">
        {alert.thresholdValue !== undefined ? `$${alert.thresholdValue}` : '—'}
      </td>
      <td className="py-4 text-fx-text-secondary">{alert.cooldownSeconds}s</td>
      <td className="py-4">
        <button
          type="button"
          onClick={onToggleActive}
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            alert.isActive
              ? 'bg-emerald-400/15 text-emerald-200'
              : 'bg-fx-surface-strong text-fx-text-muted'
          }`}
        >
          {alert.isActive ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="py-4 text-fx-text-secondary">{formatDate(alert.createdAt)}</td>
      <td className="py-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

export default function NotificationsTab() {
  const { data: alerts, isLoading, error, refetch } = useAlerts();
  const updateAlert = useUpdateAlert();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState<AlertDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AlertDTO | null>(null);

  const handleToggleActive = (alert: AlertDTO) => {
    updateAlert.mutate(
      { id: alert.id, updates: { isActive: !alert.isActive } },
      { onSuccess: () => void refetch() },
    );
  };

  const handleModalSuccess = () => {
    setShowCreateModal(false);
    setEditTarget(null);
    void refetch();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-200">Workspace</p>
          <h1 className="text-3xl font-semibold">Notifications</h1>
          <p className="max-w-3xl text-sm text-fx-text-secondary">
            Configure alerts to stay informed about trading events and system status.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          Create Alert
        </Button>
      </header>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-fx-surface-strong" />
          ))}
        </div>
      ) : error ? (
        <Card variant="error" title="Failed to load alerts" subtitle="Please try again.">
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        </Card>
      ) : !alerts || alerts.length === 0 ? (
        <EmptyState onCreateClick={() => setShowCreateModal(true)} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-fx-border text-left text-xs uppercase tracking-wider text-fx-text-muted">
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Chain</th>
                  <th className="pb-3 font-medium">Channel</th>
                  <th className="pb-3 font-medium">Threshold</th>
                  <th className="pb-3 font-medium">Cooldown</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Created</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fx-border">
                {alerts.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    onEdit={() => setEditTarget(alert)}
                    onDelete={() => setDeleteTarget(alert)}
                    onToggleActive={() => handleToggleActive(alert)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showCreateModal && (
        <AlertModal onClose={() => setShowCreateModal(false)} onSuccess={handleModalSuccess} />
      )}

      {editTarget && (
        <AlertModal
          alert={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          alert={deleteTarget}
          onConfirm={() => {
            setDeleteTarget(null);
            void refetch();
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
