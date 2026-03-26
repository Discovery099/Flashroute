import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { ApiError, success } from '../../app';
import type { AdminService } from './admin.service';
import type { UserFilters, AdminUserUpdate } from './admin.service';

export const registerAdminRoutes = (app: FastifyInstance, service: AdminService) => {
  app.get('/api/v1/admin/users', { preHandler: app.authenticate() }, async (request, reply) => {
    if (!request.principal || request.principal.role !== 'admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Admin access required');
    }
    const { page, limit, search, role, status, billingStatus, sortBy, sortOrder } = request.query as {
      page?: number;
      limit?: number;
      search?: string;
      role?: string;
      status?: string;
      billingStatus?: string;
      sortBy?: string;
      sortOrder?: string;
    };
    const result = await service.listUsers({
      page,
      limit,
      search,
      role: role as UserFilters['role'],
      status: status as UserFilters['status'],
      billingStatus,
      sortBy: sortBy as UserFilters['sortBy'],
      sortOrder: sortOrder as UserFilters['sortOrder'],
    });
    return success(reply, 200, result);
  });

  app.patch('/api/v1/admin/users/:id', { preHandler: app.authenticate() }, async (request, reply) => {
    if (!request.principal || request.principal.role !== 'admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Admin access required');
    }
    const { id } = request.params as { id: string };
    const input = request.body as AdminUserUpdate & { reason?: string };
    const result = await service.updateUser(id, input, request.principal.userId);
    return success(reply, 200, result);
  });

  app.post('/api/v1/admin/users/:id/impersonate', { preHandler: app.authenticate() }, async (request, reply) => {
    if (!request.principal || request.principal.role !== 'admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Admin access required');
    }
    const { id } = request.params as { id: string };
    const result = await service.impersonateUser(request.principal.userId, id);
    return success(reply, 200, result);
  });

  app.get('/api/v1/admin/system/health', { preHandler: app.authenticate() }, async (request, reply) => {
    if (!request.principal || request.principal.role !== 'admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Admin access required');
    }
    const result = await service.getSystemHealth();
    return success(reply, 200, result);
  });

  app.get('/api/v1/admin/system/config', { preHandler: app.authenticate() }, async (request, reply) => {
    if (!request.principal || request.principal.role !== 'admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Admin access required');
    }
    const result = await service.getSystemConfig();
    return success(reply, 200, result);
  });

  app.patch('/api/v1/admin/system/config', { preHandler: app.authenticate() }, async (request, reply) => {
    if (!request.principal || request.principal.role !== 'admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Admin access required');
    }
    const { key, value, reason } = request.body as { key: string; value: unknown; reason: string };
    await service.updateSystemConfig(key, value, request.principal.userId, reason);
    return success(reply, 200, null);
  });

  app.post('/api/v1/admin/system/maintenance/on', { preHandler: app.authenticate() }, async (request, reply) => {
    if (!request.principal || request.principal.role !== 'admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Admin access required');
    }
    const { reason } = request.body as { reason: string };
    await service.pauseExecution(request.principal.userId, reason);
    return success(reply, 200, null);
  });

  app.post('/api/v1/admin/system/maintenance/off', { preHandler: app.authenticate() }, async (request, reply) => {
    if (!request.principal || request.principal.role !== 'admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Admin access required');
    }
    await service.resumeExecution(request.principal.userId);
    return success(reply, 200, null);
  });

  app.get('/api/v1/admin/queues', { preHandler: app.authenticate() }, async (request, reply) => {
    if (!request.principal || request.principal.role !== 'admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Admin access required');
    }
    const result = await service.listQueues();
    return success(reply, 200, result);
  });
};
