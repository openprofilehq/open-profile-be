import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server as SocketIOServer, ServerOptions } from 'socket.io';
import Redis from 'ioredis';
import { env } from '../../config/env';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private pubClient: Redis;
  private subClient: Redis;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    this.pubClient = new Redis(env.REDIS_URL, { lazyConnect: true });
    this.subClient = this.pubClient.duplicate();

    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    this.logger.log('Redis adapter connected for Socket.IO');
  }

  createIOServer(port: number, options?: ServerOptions): SocketIOServer {
    const server: SocketIOServer = super.createIOServer(
      port,
      options,
    ) as SocketIOServer;
    server.adapter(this.adapterConstructor);
    return server;
  }

  async close(): Promise<void> {
    await Promise.all([this.pubClient?.quit(), this.subClient?.quit()]);
  }
}
