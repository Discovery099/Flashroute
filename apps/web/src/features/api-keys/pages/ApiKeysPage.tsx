import { Button, Card } from '@flashroute/ui';
import { Copy, CopyCheck, KeyRound, ShieldAlert, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { useApiKeys, useCreateApiKey, useDeleteApiKey, type ApiKeyDTO } from '../api';
import { useAuthStore } from '@/state/auth.store';

const PERMISSIONS = [
  { value: 'read', label: 'Read' },
  { value: 'execute', label: 'Execute' },
  { value: 'admin', label: 'Admin' },
] as const;

type Permission = (typeof PERMISSIONS)[number]['value'];

function formatDate(dateString: string | null) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateString: string | null) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function PermissionBadge({ permission }: { permission: string }) {
  return (
    <span className="rounded-full bg-fx-surface-strong px-2 py-0.5 text-xs font-medium text-fx-text-secondary">
      {permission}
    </span>
  );
}

function CreateKeyModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (key: string) => void;
}) {
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [nameError, setNameError] = useState('');
  const createApiKey = useCreateApiKey();

  const handlePermissionChange = (permission: Permission) => {
    setPermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (name.length < 2 || name.length > 50) {
      setNameError('Name must be 2-50 characters');
      return;
    }

    try {
      const result = await createApiKey.mutateAsync({
        name,
        permissions: permissions.length > 0 ? permissions : undefined,
        expiresAt: expiresAt || undefined,
      });
      onSuccess(result.key);
    } catch {
      // error handling - mutation will handle it
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="relative w-full max-w-md p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-fx-text-muted hover:text-fx-text-primary"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-semibold">Create API Key</h2>
        <p className="mt-1 text-sm text-fx-text-secondary">
          API keys grant programmatic access to your account.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-fx-text-primary" htmlFor="key-name">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              id="key-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError('');
              }}
              placeholder="e.g., Production Trading Bot"
              className="mt-1 w-full rounded-2xl border border-fx-border bg-fx-bg px-4 py-3 text-sm text-fx-text-primary outline-none focus:border-cyan-400/60"
            />
            {nameError && <p className="mt-1 text-sm text-red-300">{nameError}</p>}
          </div>

          <div>
            <span className="block text-sm font-medium text-fx-text-primary">Permissions</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {PERMISSIONS.map((perm) => (
                <label
                  key={perm.value}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-fx-border bg-fx-surface px-3 py-2 text-sm text-fx-text-secondary hover:border-cyan-400/40"
                >
                  <input
                    type="checkbox"
                    checked={permissions.includes(perm.value)}
                    onChange={() => handlePermissionChange(perm.value)}
                    className="h-4 w-4 accent-cyan-400"
                  />
                  {perm.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-fx-text-primary" htmlFor="expires-at">
              Expiration Date (optional)
            </label>
            <input
              id="expires-at"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-fx-border bg-fx-bg px-4 py-3 text-sm text-fx-text-primary outline-none focus:border-cyan-400/60"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={createApiKey.isPending}>
              {createApiKey.isPending ? 'Creating...' : 'Create Key'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function RevealKeyModal({
  apiKey,
  onAcknowledge,
}: {
  apiKey: string;
  onAcknowledge: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setShowCloseWarning(false);
    } catch {
      // fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = apiKey;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setShowCloseWarning(false);
    }
  };

  const handleAcknowledge = () => {
    onAcknowledge();
  };

  const handleCloseAttempt = () => {
    if (!copied) {
      setShowCloseWarning(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !copied) {
      e.preventDefault();
      handleCloseAttempt();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reveal-modal-title"
        className="relative w-full max-w-lg rounded-3xl border border-fx-border bg-fx-surface p-6 shadow-panel"
      >
        <h2 id="reveal-modal-title" className="text-lg font-semibold text-fx-text-primary">
          Save Your API Key
        </h2>

        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 flex-shrink-0 text-amber-400" />
            <p className="text-sm text-amber-200">
              <strong>Save this key now.</strong> You will not be able to view it again. If you lose
              it, you must revoke it and create a new one.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-fx-text-primary">Your API Key</label>
          <div className="mt-2 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                readOnly
                value={apiKey}
                className="w-full rounded-2xl border border-fx-border bg-fx-bg px-4 py-3 pr-12 font-mono text-sm text-cyan-200"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fx-text-muted hover:text-cyan-300"
                aria-label="Copy API key"
              >
                {copied ? <CopyCheck className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {showCloseWarning && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-sm text-red-200">
              You must acknowledge that you have saved your key by clicking the button below, or copy
              the key to enable close.
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button
            variant="primary"
            onClick={handleAcknowledge}
            disabled={copied ? false : true}
            className={!copied ? 'opacity-50' : ''}
          >
            I have saved my API key
          </Button>
        </div>
      </div>
    </div>
  );
}

function RevokeConfirmModal({
  keyName,
  onConfirm,
  onCancel,
}: {
  keyName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const isConfirmed = confirmText.toUpperCase() === 'REVOKE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md p-6">
        <h2 className="text-lg font-semibold">Revoke API Key</h2>
        <p className="mt-2 text-sm text-fx-text-secondary">
          This will immediately invalidate <strong>{keyName}</strong>. Any requests using this key
          will fail.
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-fx-text-primary">
            Type &quot;REVOKE&quot; to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="REVOKE"
            className="mt-1 w-full rounded-2xl border border-fx-border bg-fx-bg px-4 py-3 text-sm text-fx-text-primary outline-none focus:border-cyan-400/60"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={!isConfirmed}>
            Revoke Key
          </Button>
        </div>
      </Card>
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <Card
      title="No API keys created yet"
      subtitle="API keys allow programmatic access to your FlashRoute account."
    >
      <div className="mt-4 flex items-center gap-3">
        <KeyRound className="h-8 w-8 text-fx-text-muted" />
        <p className="text-sm text-fx-text-secondary">
          Create your first API key to start building integrations.
        </p>
      </div>
      <div className="mt-6">
        <Button variant="primary" onClick={onCreateClick}>
          Create API Key
        </Button>
      </div>
    </Card>
  );
}

function ApiKeysTable({ apiKeys, onRevoke }: { apiKeys: ApiKeyDTO[]; onRevoke: (key: ApiKeyDTO) => void }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-fx-border text-left text-xs uppercase tracking-wider text-fx-text-muted">
              <th className="pb-3 font-medium">Name</th>
              <th className="pb-3 font-medium">Key Prefix</th>
              <th className="pb-3 font-medium">Permissions</th>
              <th className="pb-3 font-medium">Last Used</th>
              <th className="pb-3 font-medium">Created</th>
              <th className="pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-fx-border">
            {apiKeys.map((key) => (
              <tr key={key.id} className="text-sm">
                <td className="py-4 font-medium text-fx-text-primary">{key.name}</td>
                <td className="py-4">
                  <code className="rounded bg-fx-surface-strong px-2 py-1 font-mono text-xs text-cyan-300">
                    {key.keyPrefix}
                  </code>
                </td>
                <td className="py-4">
                  <div className="flex flex-wrap gap-1">
                    {key.permissions.length > 0 ? (
                      key.permissions.map((perm) => (
                        <PermissionBadge key={perm} permission={perm} />
                      ))
                    ) : (
                      <span className="text-fx-text-muted">—</span>
                    )}
                  </div>
                </td>
                <td className="py-4 text-fx-text-secondary">
                  {formatDateTime(key.lastUsedAt)}
                </td>
                <td className="py-4 text-fx-text-secondary">{formatDate(key.createdAt)}</td>
                <td className="py-4">
                  <Button variant="danger" size="sm" onClick={() => onRevoke(key)}>
                    Revoke
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function ApiKeysPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyDTO | null>(null);

  const userRole = useAuthStore((state) => state.user?.role);
  const canCreateKey = userRole === 'trader' || userRole === 'executor' || userRole === 'institutional' || userRole === 'admin';

  const { data: apiKeys, isLoading, error, refetch } = useApiKeys();
  const deleteApiKey = useDeleteApiKey();

  const handleCreateSuccess = (key: string) => {
    setShowCreateModal(false);
    setRevealKey(key);
  };

  const handleRevealAcknowledge = () => {
    setRevealKey(null);
    void refetch();
  };

  const handleRevokeConfirm = () => {
    if (revokeTarget) {
      deleteApiKey.mutate(revokeTarget.id, {
        onSuccess: () => {
          setRevokeTarget(null);
          void refetch();
        },
      });
    }
  };

  return (
    <div className="space-y-6 text-fx-text-primary">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-200">Workspace</p>
          <h1 className="text-3xl font-semibold">API Keys</h1>
          <p className="max-w-3xl text-sm text-fx-text-secondary">
            Manage API keys for programmatic access to your FlashRoute account.
          </p>
        </div>
        {canCreateKey && (
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            Create API Key
          </Button>
        )}
      </header>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-fx-surface-strong" />
          ))}
        </div>
      ) : error ? (
        <Card variant="error" title="Failed to load API keys" subtitle="Please try again.">
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        </Card>
      ) : !apiKeys || apiKeys.length === 0 ? (
        <EmptyState onCreateClick={() => setShowCreateModal(true)} />
      ) : (
        <ApiKeysTable apiKeys={apiKeys} onRevoke={setRevokeTarget} />
      )}

      {showCreateModal && (
        <CreateKeyModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {revealKey && <RevealKeyModal apiKey={revealKey} onAcknowledge={handleRevealAcknowledge} />}

      {revokeTarget && (
        <RevokeConfirmModal
          keyName={revokeTarget.name}
          onConfirm={handleRevokeConfirm}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </div>
  );
}
