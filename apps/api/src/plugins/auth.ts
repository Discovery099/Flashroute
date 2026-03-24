import type { FastifyInstance, FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';

import { ApiError } from '../app';
import type { ApiKeysService } from '../modules/api-keys/api-keys.service';
import type { ApiKeyPermission, UserRole } from '../modules/auth/auth.repository';
import { permissionsForRole, type AuthService } from '../modules/auth/auth.service';

export interface Principal {
  userId: string;
  role: UserRole;
  permissions: ApiKeyPermission[];
  authMethod: 'jwt' | 'api_key';
}

export interface AuthenticateOptions {
  allowApiKey?: boolean;
  requiredScopes?: ApiKeyPermission[];
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }

  interface FastifyInstance {
    authenticate: (options?: AuthenticateOptions) => (
      request: FastifyRequest,
      reply: FastifyReply,
      done: HookHandlerDoneFunction,
    ) => void | Promise<void>;
  }
}

const hasScopes = (principal: Principal, requiredScopes: ApiKeyPermission[]) =>
  requiredScopes.every((scope) => principal.permissions.includes(scope));

export const registerAuthPlugin = (
  app: FastifyInstance,
  services: { authService: AuthService; apiKeysService: ApiKeysService },
) => {
  app.decorate('authenticate', (options: AuthenticateOptions = {}) => async (request: FastifyRequest) => {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      const token = authorization.slice('Bearer '.length);
      const payload = services.authService.verifyAccessToken(token);
      const principal: Principal = {
        userId: payload.sub,
        role: payload.role as UserRole,
        permissions: permissionsForRole(payload.role as UserRole),
        authMethod: 'jwt',
      };
      if (options.requiredScopes?.length && !hasScopes(principal, options.requiredScopes)) {
        throw new ApiError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      request.principal = principal;
      return;
    }

    const apiKey = request.headers['x-api-key']?.toString();
    if (apiKey && options.allowApiKey) {
      const principal = await services.apiKeysService.authenticate(apiKey);
      request.principal = principal;
      if (options.requiredScopes?.length && !hasScopes(principal, options.requiredScopes)) {
        throw new ApiError(403, 'FORBIDDEN', 'Insufficient API key scope');
      }
      return;
    }

    if (apiKey && !options.allowApiKey) {
      throw new ApiError(403, 'FORBIDDEN', 'API keys are not allowed for this route');
    }

    throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
  });
};
