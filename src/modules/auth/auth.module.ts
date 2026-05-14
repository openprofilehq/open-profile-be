import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StringValue } from 'ms';
import { env } from '../../config/env';
import { MailModule } from '../mail/mail.module';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { UsersModule } from '../users/users.module';
import { QueueModule } from '../queue/queue.module';
import { RedisModule } from '../../common/redis/redis.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { RedisLockService } from './services/redis-lock.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshToken } from './entities/refresh-token.entity';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: env.JWT_ACCESS_EXPIRES_IN as StringValue },
    }),
    TypeOrmModule.forFeature([RefreshToken]),
    UsersModule,
    MailModule,
    QueueModule,
    RateLimiterModule,
    RedisModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    RedisLockService,
    JwtAuthGuard,
    JwtStrategy,
    GoogleStrategy,
  ],
  exports: [AuthService, TokenService, RedisLockService, JwtAuthGuard],
})
export class AuthModule {}
