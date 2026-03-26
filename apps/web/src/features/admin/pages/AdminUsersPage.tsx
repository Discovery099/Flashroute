import { Button, Card } from '@flashroute/ui';
import { Search, Lock, Unlock, UserCheck } from 'lucide-react';
import { useState } from 'react';

import { useAdminUsers, useImpersonateUser, useUpdateAdminUser, type AdminUserDTO } from '../api';

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'monitor', label: 'Monitor' },
  { value: 'trader', label: 'Trader' },
  { value: 'executor', label: 'Executor' },
  { value: 'institutional', label: 'Institutional' },
  { value: 'admin', label: 'Admin' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'locked', label: 'Locked' },
  { value: 'deleted', label: 'Deleted' },
];

const BILLING_STATUS_OPTIONS = [
  { value: '', label: 'All billing' },
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past due' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'trialing', label: 'Trial' },
];

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

function Badge({ variant, children }: { variant: 'positive' | 'warning' | 'error' | 'secondary'; children: React.ReactNode }) {
  const classes: Record<string, string> = {
    positive: 'rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300',
    warning: 'rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300',
    error: 'rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-300',
    secondary: 'rounded-full bg-fx-surface-strong px-2 py-0.5 text-xs font-medium text-fx-text-secondary',
  };
  return <span className={classes[variant]}>{children}</span>;
}

function UserActions({ user }: { user: AdminUserDTO }) {
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showImpersonateConfirm, setShowImpersonateConfirm] = useState(false);
  const [lockReason, setLockReason] = useState('');
  const updateUser = useUpdateAdminUser();
  const impersonate = useImpersonateUser();

  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();

  const handleLockToggle = () => {
    if (isLocked) {
      updateUser.mutate({
        userId: user.id,
        updates: { lockedUntil: null },
      });
    } else {
      setShowLockConfirm(true);
    }
  };

  const handleLockConfirm = () => {
    updateUser.mutate({
      userId: user.id,
      updates: { lockedUntil: '2030-01-01T00:00:00Z', reason: lockReason },
    });
    setShowLockConfirm(false);
    setLockReason('');
  };

  const handleImpersonate = () => {
    impersonate.mutate(user.id, {
      onSuccess: (data) => {
        if (data.success && data.data?.accessToken) {
          window.open(`/impersonate?token=${data.data.accessToken}`, '_blank');
        }
      },
    });
    setShowImpersonateConfirm(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={isLocked ? 'secondary' : 'danger'}
        onClick={handleLockToggle}
        disabled={updateUser.isPending}
      >
        {isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setShowImpersonateConfirm(true)}
        disabled={impersonate.isPending}
      >
        <UserCheck className="h-4 w-4" />
      </Button>

      {showLockConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-lg font-semibold">Lock User Account</h3>
            <p className="mt-2 text-sm text-fx-text-secondary">
              This will prevent the user from logging in until unlocked.
            </p>
            <div className="mt-4">
              <label className="text-sm font-medium">Reason (optional)</label>
              <input
                className="mt-1 w-full rounded-2xl border border-fx-border bg-fx-bg px-4 py-3 text-sm"
                value={lockReason}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLockReason(e.target.value)}
                placeholder="Enter reason for audit log"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowLockConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleLockConfirm} disabled={updateUser.isPending}>
                {updateUser.isPending ? 'Locking...' : 'Lock Account'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showImpersonateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md p-6">
            <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="text-sm text-amber-200">
                <strong>Warning:</strong> Impersonation allows access to this user&apos;s account with their
                permissions. All actions will be logged.
              </p>
            </div>
            <h3 className="text-lg font-semibold">Impersonate {user.email}?</h3>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowImpersonateConfirm(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleImpersonate} disabled={impersonate.isPending}>
                {impersonate.isPending ? 'Starting...' : 'Impersonate'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function UserTable({ users }: { users: AdminUserDTO[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-fx-border text-left text-xs uppercase tracking-wider text-fx-text-muted">
            <th className="pb-3 font-medium">Name</th>
            <th className="pb-3 font-medium">Email</th>
            <th className="pb-3 font-medium">Role</th>
            <th className="pb-3 font-medium">Billing</th>
            <th className="pb-3 font-medium">Created</th>
            <th className="pb-3 font-medium">Last Seen</th>
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-fx-border">
          {users.map((user) => {
            const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
            return (
              <tr key={user.id} className="text-sm">
                <td className="py-4 font-medium">{user.name}</td>
                <td className="py-4">{user.email}</td>
                <td className="py-4">
                  <Badge variant="secondary">{user.role}</Badge>
                </td>
                <td className="py-4">
                  {user.subscription ? (
                    <Badge
                      variant={
                        user.subscription.status === 'active'
                          ? 'positive'
                          : user.subscription.status === 'past_due'
                            ? 'warning'
                            : 'secondary'
                      }
                    >
                      {user.subscription.plan}
                    </Badge>
                  ) : (
                    <span className="text-fx-text-muted">—</span>
                  )}
                </td>
                <td className="py-4">{formatDate(user.createdAt)}</td>
                <td className="py-4">{formatDateTime(user.updatedAt)}</td>
                <td className="py-4">
                  {isLocked ? (
                    <Badge variant="error">Locked</Badge>
                  ) : user.deletedAt ? (
                    <Badge variant="secondary">Deleted</Badge>
                  ) : (
                    <Badge variant="positive">Active</Badge>
                  )}
                </td>
                <td className="py-4">
                  <UserActions user={user} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AdminUsersPage() {
  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    search: '',
    role: '',
    status: '',
    billingStatus: '',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const { data, isLoading, error } = useAdminUsers(filters);
  const users = data?.items ?? [];
  const meta = data?.meta;

  const handleSearchChange = (value: string) => {
    setFilters((f) => ({ ...f, search: value, page: 1 }));
  };

  const handleRoleChange = (value: string) => {
    setFilters((f) => ({ ...f, role: value, page: 1 }));
  };

  const handleStatusChange = (value: string) => {
    setFilters((f) => ({ ...f, status: value, page: 1 }));
  };

  const handleBillingStatusChange = (value: string) => {
    setFilters((f) => ({ ...f, billingStatus: value, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters((f) => ({ ...f, page }));
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-fx-text-muted">Admin</p>
          <h1 className="text-2xl font-semibold text-fx-text-primary">User Administration</h1>
          <p className="max-w-2xl text-sm text-fx-text-secondary">
            Search, review, and manage customer accounts. All actions are logged for audit purposes.
          </p>
        </div>
      </header>

      <Card>
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fx-text-muted" />
            <input
              className="w-full rounded-2xl border border-fx-border bg-fx-bg py-3 pl-10 pr-4 text-sm"
              placeholder="Search by name or email..."
              value={filters.search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearchChange(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <select
              className="h-11 rounded-2xl border border-fx-border bg-fx-surface px-3 text-sm"
              value={filters.role}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleRoleChange(e.target.value)}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select
              className="h-11 rounded-2xl border border-fx-border bg-fx-surface px-3 text-sm"
              value={filters.status}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleStatusChange(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select
              className="h-11 rounded-2xl border border-fx-border bg-fx-surface px-3 text-sm"
              value={filters.billingStatus}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleBillingStatusChange(e.target.value)}
            >
              {BILLING_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-fx-surface-strong" />
            ))}
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-fx-text-secondary">Failed to load users. Please try again.</p>
          </div>
        ) : users.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-fx-text-secondary">
              {filters.search || filters.role || filters.status || filters.billingStatus
                ? 'No users match your filters.'
                : 'No users in the system.'}
            </p>
          </div>
        ) : (
          <>
            <UserTable users={users} />
            {meta && meta.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-fx-text-secondary">
                  Showing {(meta.page - 1) * meta.limit + 1} to{' '}
                  {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} users
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={meta.page <= 1}
                    onClick={() => handlePageChange(meta.page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={meta.page >= meta.totalPages}
                    onClick={() => handlePageChange(meta.page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}