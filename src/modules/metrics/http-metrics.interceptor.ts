import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const method = request.method;
    const route: string =
      (request.route as { path?: string } | undefined)?.path ??
      request.url?.split('?')[0] ??
      '/';

    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = response.statusCode;
          const durationSeconds = this.secondsSince(start);

          this.metricsService.httpRequestsTotal.inc({
            method,
            route,
            status_code: statusCode,
          });
          this.metricsService.httpRequestDurationSeconds.observe(
            { method, route, status_code: statusCode },
            durationSeconds,
          );

          if (statusCode >= 400) {
            this.metricsService.httpErrorsTotal.inc({
              method,
              route,
              status_code: statusCode,
            });
          }
        },
        error: () => {
          const statusCode = response.statusCode || 500;
          const durationSeconds = this.secondsSince(start);

          this.metricsService.httpRequestsTotal.inc({
            method,
            route,
            status_code: statusCode,
          });
          this.metricsService.httpRequestDurationSeconds.observe(
            { method, route, status_code: statusCode },
            durationSeconds,
          );
          this.metricsService.httpErrorsTotal.inc({
            method,
            route,
            status_code: statusCode,
          });
        },
      }),
    );
  }

  private secondsSince(start: bigint): number {
    const elapsed = process.hrtime.bigint() - start;
    return Number(elapsed) / 1e9;
  }
}
