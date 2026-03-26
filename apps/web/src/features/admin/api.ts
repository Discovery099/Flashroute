import { useMutation, useQuery } from '@tanstack/react-query';

export interface AdminUserDTO {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string;
  } | null;
}

export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedUsersResponse {
  items: AdminUserDTO[];
  meta: PaginatedMeta;
}

export interface SystemHealth {
  database: { status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'; latencyMs?: number };
  redis: { status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'; latencyMs?: number };
  chains: Record<number, { status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'; latencyMs?: number; rpcUrl?: string }>;
  workers: Record<string, { status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'; lastHeartbeat?: string }>;
  system: {
    uptimeSeconds: number;
    memoryUsageMb: number;
    version: string;
  };
}

export interface SystemConfigDTO {
  key: string;
  value: unknown;
  description: string;
  updatedAt: string;
  updatedBy: string | null;
}

export type UserFilters = {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
  billingStatus?: string;
  sortBy?: string;
  sortOrder?: string;
};

export const useAdminUsers = (filters: UserFilters) =>
  useQuery<PaginatedUsersResponse>({
    queryKey: ['admin', 'users', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.search) params.set('search', filters.search);
      if (filters.role) params.set('role', filters.role);
      if (filters.status) params.set('status', filters.status);
      if (filters.billingStatus) params.set('billingStatus', filters.billingStatus);
      if (filters.sortBy) params.set('sortBy', filters.sortBy);
      if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
      return fetch(`/api/v1/admin/users?${params}`, { credentials: 'include' }).then(r => r.json()).then(d => d.data);
    },
  });

export const useUpdateAdminUser = () =>
  useMutation({
    mutationFn: ({ userId, updates }: { userId: string; updates: Record<string, unknown> }) =>
      fetch(`/api/v1/admin/users/${userId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).then(r => r.json()),
  });

export const useImpersonateUser = () =>
  useMutation({
    mutationFn: (userId: string) =>
      fetch(`/api/v1/admin/users/${userId}/impersonate`, {
        method: 'POST',
        credentials: 'include',
      }).then(r => r.json()),
  });

export const useSystemHealth = () =>
  useQuery<SystemHealth>({
    queryKey: ['admin', 'system', 'health'],
    queryFn: () =>
      fetch('/api/v1/admin/system/health', { credentials: 'include' }).then(r => r.json()).then(d => d.data),
    refetchInterval: 30_000,
  });

export const useSystemConfig = () =>
  useQuery<SystemConfigDTO[]>({
    queryKey: ['admin', 'system', 'config'],
    queryFn: () =>
      fetch('/api/v1/admin/system/config', { credentials: 'include' }).then(r => r.json()).then(d => d.data),
  });

export const useUpdateSystemConfig = () =>
  useMutation({
    mutationFn: ({ key, value, reason }: { key: string; value: unknown; reason: string }) =>
      fetch('/api/v1/admin/system/config', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, reason }),
      }).then(r => r.json()),
  });

export const usePauseExecution = () =>
  useMutation({
    mutationFn: (reason: string) =>
      fetch('/api/v1/admin/system/maintenance/on', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      }).then(r => r.json()),
  });

export const useResumeExecution = () =>
  useMutation({
    mutationFn: () =>
      fetch('/api/v1/admin/system/maintenance/off', {
        method: 'POST',
        credentials: 'include',
      }).then(r => r.json()),
  });