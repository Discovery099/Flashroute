import type { FastifyInstance } from 'fastify';

import { getRequestMetadata, success } from '../../app';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schemas';
import type { AuthService } from './auth.service';

export const registerAuthRoutes = (app: FastifyInstance, authService: AuthService) => {
  app.post('/api/v1/auth/register', async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const result = await authService.register(input, getRequestMetadata(request));
    return success(reply, 201, result);
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const result = await authService.login(input, getRequestMetadata(request));
    return success(reply, 200, result);
  });

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const input = refreshSchema.parse(request.body);
    const result = await authService.refreshTokens(input.refreshToken, getRequestMetadata(request));
    return success(reply, 200, result);
  });

  app.post('/api/v1/auth/logout', { preHandler: app.authenticate() }, async (request, reply) => {
    const input = logoutSchema.parse(request.body);
    await authService.logoutWithContext(request.principal!.userId, input.refreshToken, getRequestMetadata(request));
    return success(reply, 200, { message: 'Logged out' });
  });

  app.post('/api/v1/auth/verify-email', async (request, reply) => {
    const input = verifyEmailSchema.parse(request.body);
    await authService.verifyEmail(input.token);
    return success(reply, 200, { message: 'Email verified' });
  });

  app.post('/api/v1/auth/forgot-password', async (request, reply) => {
    const input = forgotPasswordSchema.parse(request.body);
    await authService.forgotPassword(input.email, getRequestMetadata(request));
    return success(reply, 200, { message: 'If that email exists, a reset link has been sent.' });
  });

  app.post('/api/v1/auth/reset-password', async (request, reply) => {
    const input = resetPasswordSchema.parse(request.body);
    await authService.resetPassword(input.token, input.password);
    return success(reply, 200, { message: 'Password updated. Please log in.' });
  });
};
