import {
  Module,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { RedisModule } from './common/redis/redis.module';
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import './config/env';
import { jwtConfig } from './config/jwt.config';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { HealthModule } from './modules/health/health.module';
import { WaitlistModule } from './modules/waitlist/waitlist.module';
import { UsersModule } from './modules/users/users.module';
import { QueueModule } from './modules/queue/queue.module';
import { MailModule } from './modules/mail/mail.module';
import { ProfileModule } from './modules/profile/profile.module';
import { UsernamesModule } from './modules/usernames/usernames.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { SearchModule } from './modules/search/search.module';
import { ContactModule } from './modules/contact/contact.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { UploadModule } from './modules/upload/upload.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { HttpMetricsInterceptor } from './modules/metrics/http-metrics.interceptor';
import { ValidationError } from 'class-validator';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
        autoLogging: true,
      },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    TypeOrmModule.forRootAsync({
      useFactory: (): TypeOrmModuleOptions => databaseConfig(),
    }),
    RedisModule,
    QueueModule,
    WaitlistModule,
    HealthModule,
    UsersModule,
    AuthModule,
    MailModule,
    ProfileModule,
    SearchModule,
    UsernamesModule,
    AnalyticsModule,
    ContactModule,
    PortfolioModule,
    UploadModule,
    MetricsModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: false },
        exceptionFactory: (errors) => {
          const flatten = (
            errs: ValidationError[],
            parentField = '',
          ): { field: string; error: string }[] => {
            const result: { field: string; error: string }[] = [];
            for (const e of errs) {
              const field = parentField
                ? `${parentField}.${e.property}`
                : e.property;
              const constraints = Object.values(e.constraints ?? {});
              if (constraints.length > 0) {
                result.push({ field, error: constraints.join(', ') });
              }
              if (e.children?.length) {
                result.push(...flatten(e.children, field));
              }
            }
            return result;
          };

          const formatted = flatten(errors);
          return new UnprocessableEntityException(formatted);
        },
      }),
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
