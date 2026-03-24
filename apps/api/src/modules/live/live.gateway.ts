import { randomUUID } from 'node:crypto';

import type { OpportunityApiView } from '@flashroute/shared/contracts/opportunity';

import type { UserRole } from '../auth/auth.repository';
import { filterAuthorizedChannels } from './live.policy';
import { toOpportunityApiView } from '../opportunities/opportunities.routes';

interface LiveSocket {
  send(payload: unknown): void;
}

interface LivePrincipal {
  userId: string;
  role: UserRole;
}

interface ActiveSession {
  connectionId: string;
  principal: LivePrincipal;
  socket: LiveSocket;
  subscriptions: Set<string>;
}

interface ResumableSession {
  userId: string;
  subscriptions: string[];
  resumableUntil: number;
}

export interface LiveGatewayOptions {
  verifyToken: (token: string | undefined) => LivePrincipal | null;
  now?: () => number;
  sessionTtlMs?: number;
}

export class LiveGateway {
  private readonly now: () => number;
  private readonly sessionTtlMs: number;
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly resumableSessions = new Map<string, ResumableSession>();

  public constructor(private readonly options: LiveGatewayOptions) {
    this.now = options.now ?? Date.now;
    this.sessionTtlMs = options.sessionTtlMs ?? 60_000;
  }

  public connect(input: { token?: string; socket: LiveSocket; resumeConnectionId?: string }) {
    this.pruneExpiredResumableSessions();
    const principal = this.options.verifyToken(input.token);
    if (!principal) {
      throw new Error('Authentication required');
    }

    const resumed = input.resumeConnectionId ? this.resume(input.resumeConnectionId, input.socket, principal) : null;
    if (resumed) {
      return resumed;
    }

    const connectionId = randomUUID();
    this.sessions.set(connectionId, {
      connectionId,
      principal,
      socket: input.socket,
      subscriptions: new Set(),
    });
    this.send(connectionId, {
      type: 'connected',
      data: {
        authenticated: true,
        connectionId,
        resumed: false,
        resumableUntil: new Date(this.now() + this.sessionTtlMs).toISOString(),
      },
    });
    return { connectionId };
  }

  public disconnect(connectionId: string): void {
    this.pruneExpiredResumableSessions();
    const session = this.sessions.get(connectionId);
    if (!session) {
      return;
    }

    this.sessions.delete(connectionId);
    this.resumableSessions.set(connectionId, {
      userId: session.principal.userId,
      subscriptions: [...session.subscriptions],
      resumableUntil: this.now() + this.sessionTtlMs,
    });
  }

  public handleClientMessage(connectionId: string, payload: { type: string; channels?: string[] }): void {
    this.pruneExpiredResumableSessions();
    const session = this.requireSession(connectionId);

    if (payload.type === 'subscribe') {
      const channels = filterAuthorizedChannels(session.principal.role, payload.channels ?? []);
      for (const channel of channels) {
        session.subscriptions.add(channel);
      }
      this.send(connectionId, { type: 'subscribed', data: { channels: [...session.subscriptions] } });
      return;
    }

    if (payload.type === 'unsubscribe') {
      for (const channel of payload.channels ?? []) {
        session.subscriptions.delete(channel);
      }
      this.send(connectionId, { type: 'unsubscribed', data: { channels: payload.channels ?? [] } });
      return;
    }

    if (payload.type === 'ping') {
      this.send(connectionId, { type: 'pong' });
    }
  }

  public handlePubSubMessage(channel: string, rawPayload: string): void {
    this.pruneExpiredResumableSessions();
    const payload = JSON.parse(rawPayload) as { type: string; data: OpportunityApiView | Record<string, unknown> };
    const data = payload.type === 'opportunity'
      ? ('flashLoanToken' in payload.data ? (payload.data as OpportunityApiView) : toOpportunityApiView(payload.data as never))
      : payload.data;
    for (const [connectionId, session] of this.sessions.entries()) {
      if (!session.subscriptions.has(channel)) {
        continue;
      }

      this.send(connectionId, {
        type: payload.type,
        channel,
        data,
      });
    }
  }

  public getResumableSessionCount(): number {
    this.pruneExpiredResumableSessions();
    return this.resumableSessions.size;
  }

  private resume(connectionId: string, socket: LiveSocket, principal: LivePrincipal) {
    this.pruneExpiredResumableSessions();
    const session = this.resumableSessions.get(connectionId);
    if (!session || session.resumableUntil < this.now() || session.userId !== principal.userId) {
      return null;
    }

    const authorizedSubscriptions = filterAuthorizedChannels(principal.role, session.subscriptions);
    this.resumableSessions.delete(connectionId);
    this.sessions.set(connectionId, {
      connectionId,
      principal,
      socket,
      subscriptions: new Set(authorizedSubscriptions),
    });
    this.send(connectionId, {
      type: 'connected',
      data: {
        authenticated: true,
        connectionId,
        resumed: true,
        resumableUntil: new Date(this.now() + this.sessionTtlMs).toISOString(),
      },
    });
    this.send(connectionId, {
      type: 'subscribed',
      data: {
        channels: authorizedSubscriptions,
      },
    });
    return { connectionId };
  }

  private requireSession(connectionId: string): ActiveSession {
    const session = this.sessions.get(connectionId);
    if (!session) {
      throw new Error(`Unknown connection: ${connectionId}`);
    }

    return session;
  }

  private send(connectionId: string, payload: unknown): void {
    this.requireSession(connectionId).socket.send(payload);
  }

  private pruneExpiredResumableSessions(): void {
    const now = this.now();
    for (const [connectionId, session] of this.resumableSessions.entries()) {
      if (session.resumableUntil < now) {
        this.resumableSessions.delete(connectionId);
      }
    }
  }
}
