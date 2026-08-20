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

    try {
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
    } catch (err) {
      this.logger.error(
        `Redis connection failed during startup, cleaning up partial connections: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.closeQuietly();
      throw err;
    }

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

  /**
   * Closes both Redis clients, logging (not throwing) on failure.
   * Safe to call from signal handlers and from startup-failure cleanup.
   */
  async close(): Promise<void> {
    const results = await Promise.allSettled([
      this.pubClient?.quit(),
      this.subClient?.quit(),
    ]);

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(
          `Failed to close a Redis client during shutdown: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        );
      }
    }
  }

  private async closeQuietly(): Promise<void> {
    await this.close();
  }
}
