import type { FastifyInstance } from 'fastify';

import { getRequestMetadata, success } from '../../app';
import { changePasswordSchema, disableTwoFactorSchema, setupTwoFactorVerifySchema, updateProfileSchema } from '../auth/auth.schemas';
import type { UserService } from './user.service';

export const registerUserRoutes = (app: FastifyInstance, userService: UserService) => {
  app.get('/api/v1/users/me', { preHandler: app.authenticate({ allowApiKey: true, requiredScopes: ['read'] }) }, async (request, reply) =>
    success(reply, 200, { user: await userService.getProfile(request.principal!.userId) }),
  );

  app.patch('/api/v1/users/me', { preHandler: app.authenticate() }, async (request, reply) => {
    const input = updateProfileSchema.parse(request.body);
    return success(reply, 200, { user: await userService.updateProfile(request.principal!.userId, input) });
  });

  app.put('/api/v1/users/me/password', { preHandler: app.authenticate() }, async (request, reply) => {
    const input = changePasswordSchema.parse(request.body);
    await userService.changePassword(request.principal!.userId, input);
    return success(reply, 200, { message: 'Password updated' });
  });

  app.post('/api/v1/users/me/2fa/setup', { preHandler: app.authenticate() }, async (request, reply) =>
    success(reply, 200, await userService.setupTwoFactor(request.principal!.userId, getRequestMetadata(request))),
  );

  app.post('/api/v1/users/me/2fa/verify', { preHandler: app.authenticate() }, async (request, reply) => {
    const input = setupTwoFactorVerifySchema.parse(request.body);
    return success(
      reply,
      200,
      await userService.verifyTwoFactor(request.principal!.userId, input.code, getRequestMetadata(request)),
    );
  });

  app.delete('/api/v1/users/me/2fa', { preHandler: app.authenticate() }, async (request, reply) => {
    const input = disableTwoFactorSchema.parse(request.body);
    await userService.disableTwoFactor(request.principal!.userId, input.code, getRequestMetadata(request));
    return success(reply, 200, { message: 'Two-factor authentication disabled' });
  });
};
