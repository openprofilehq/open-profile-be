import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../../modules/auth/services/token.service';
import { env } from '../../config/env';

const allowedOrigins = new Set(env.CORS_ORIGINS);

interface SocketData {
  userId?: string;
}
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly tokenService: TokenService) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const cookieHeader = client.handshake.headers.cookie ?? '';
      const accessToken = this.extractCookie(cookieHeader, 'accessToken');

      if (!accessToken) {
        throw new Error('No access token in handshake');
      }

      const payload = await this.tokenService.verifyAccessToken(accessToken);
      (client.data as SocketData).userId = payload.sub;
      await client.join(payload.sub);

      this.logger.log(`Client connected: user ${payload.sub}`);
    } catch (err) {
      this.logger.warn(
        `WS handshake rejected: ${err instanceof Error ? err.message : String(err)}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as SocketData;
    if (data.userId) {
      this.logger.log(`Client disconnected: user ${String(data.userId)}`);
    }
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(userId).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown): void {
    if (userIds.length === 0) return;
    // socket.io accepts an array of rooms directly
    this.server.to(userIds).emit(event, payload);
  }

  private extractCookie(
    cookieHeader: string,
    name: string,
  ): string | undefined {
    const match = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`));
    return match
      ? decodeURIComponent(match.split('=').slice(1).join('='))
      : undefined;
  }
}
