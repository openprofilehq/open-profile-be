import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server as SocketIOServer, ServerOptions } from 'socket.io';
import Redis from 'ioredis';
import { env } from '../../config/env';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const pubClient: Redis = new Redis(env.REDIS_URL);
    const subClient: Redis = pubClient.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
    await Promise.resolve();
  }

  createIOServer(port: number, options?: ServerOptions): SocketIOServer {
    const server: SocketIOServer = super.createIOServer(
      port,
      options,
    ) as SocketIOServer;
    server.adapter(this.adapterConstructor);
    return server;
  }
}
