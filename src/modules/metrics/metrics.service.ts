import { Injectable, Logger } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
} from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly registry: Registry;

  public readonly httpRequestsTotal: Counter<string>;
  public readonly httpRequestDurationSeconds: Histogram<string>;
  public readonly httpErrorsTotal: Counter<string>;

  constructor() {
    this.registry = new Registry();

    collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpErrorsTotal = new Counter({
      name: 'http_errors_total',
      help: 'Total HTTP error responses (4xx and 5xx)',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.logger.log('Metrics registered');
  }

  getRegistry(): Registry {
    return this.registry;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
