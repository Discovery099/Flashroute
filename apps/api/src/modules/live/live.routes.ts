import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';

import type { LiveGateway } from './live.gateway';

export interface LivePubSubSubscriber {
  psubscribe(pattern: string): Promise<unknown>;
  punsubscribe(pattern: string): Promise<unknown>;
  on(event: 'pmessage', listener: (pattern: string, channel: string, payload: string) => void): this;
  off(event: 'pmessage', listener: (pattern: string, channel: string, payload: string) => void): this;
}

export const registerLiveRoutes = async (
  app: FastifyInstance,
  liveGateway: LiveGateway,
  subscriber?: LivePubSubSubscriber,
) => {
  await app.register(websocket);

  const listener = (_pattern: string, channel: string, payload: string) => {
    liveGateway.handlePubSubMessage(channel, payload);
  };

  if (subscriber) {
    await subscriber.psubscribe('opportunities:*');
    await subscriber.psubscribe('trades:live');
    await subscriber.psubscribe('system:alerts');
    subscriber.on('pmessage', listener);
    app.addHook('onClose', async () => {
      subscriber.off('pmessage', listener);
      await subscriber.punsubscribe('opportunities:*');
      await subscriber.punsubscribe('trades:live');
      await subscriber.punsubscribe('system:alerts');
    });
  }

  app.get('/ws', { websocket: true }, (socket, request) => {
    const query = request.query as { token?: string; resumeConnectionId?: string };

    let connectionId: string;
    try {
      connectionId = liveGateway.connect({
        token: query.token,
        resumeConnectionId: query.resumeConnectionId,
        socket: {
          send(payload) {
            socket.send(JSON.stringify(payload));
          },
        },
      }).connectionId;
    } catch {
      socket.close(1008, 'Authentication required');
      return;
    }

    socket.on('message', (buffer: Buffer) => {
      const payload = JSON.parse(buffer.toString()) as { type: string; channels?: string[] };
      liveGateway.handleClientMessage(connectionId, payload);
    });
    socket.on('close', () => {
      liveGateway.disconnect(connectionId);
    });
  });
};
