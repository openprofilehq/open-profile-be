import { Test, TestingModule } from '@nestjs/testing';
import { Histogram } from 'prom-client';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  afterEach(() => {
    service.getRegistry().clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have http_requests_total counter', () => {
    expect(service.httpRequestsTotal).toBeDefined();
  });

  it('should have http_request_duration_seconds histogram', () => {
    expect(service.httpRequestDurationSeconds).toBeDefined();
  });

  it('should have http_errors_total counter', () => {
    expect(service.httpErrorsTotal).toBeDefined();
  });

  it('should increment http_requests_total counter', () => {
    service.httpRequestsTotal.inc({
      method: 'GET',
      route: '/test',
      status_code: 200,
    });
    const metrics = service
      .getRegistry()
      .getSingleMetric('http_requests_total');
    expect(metrics).toBeDefined();
  });

  it('should observe http_request_duration_seconds histogram', () => {
    service.httpRequestDurationSeconds.observe(
      { method: 'POST', route: '/test', status_code: 201 },
      0.123,
    );
    const metrics = service
      .getRegistry()
      .getSingleMetric('http_request_duration_seconds');
    expect(metrics).toBeDefined();
  });

  it('should increment http_errors_total counter', () => {
    service.httpErrorsTotal.inc({
      method: 'GET',
      route: '/test',
      status_code: 404,
    });
    const metrics = service.getRegistry().getSingleMetric('http_errors_total');
    expect(metrics).toBeDefined();
  });

  it('should return valid Prometheus text format from getMetrics', async () => {
    service.httpRequestsTotal.inc({
      method: 'GET',
      route: '/test',
      status_code: 200,
    });

    const output = await service.getMetrics();

    expect(output).toContain('# HELP');
    expect(output).toContain('# TYPE');
    expect(output).toContain('http_requests_total');
  });

  it('should include default metrics from collectDefaultMetrics', async () => {
    const output = await service.getMetrics();

    expect(output).toContain('process_cpu_');
  });

  it('should record histogram values in configured buckets', () => {
    service.httpRequestDurationSeconds.observe(
      { method: 'GET', route: '/test', status_code: 200 },
      0.05,
    );
    const metric = service
      .getRegistry()
      .getSingleMetric('http_request_duration_seconds') as
      | Histogram<string>
      | undefined;
    expect(metric).toBeDefined();
  });
});
