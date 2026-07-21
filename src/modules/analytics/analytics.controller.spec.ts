import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

jest.mock('@t3-oss/env-core', () => ({
  createEnv: () => ({}) as never,
}));

jest.mock('uuid', () => ({
  v7: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let analyticsService: jest.Mocked<
    Pick<
      AnalyticsService,
      'getProfileViewStats' | 'getLinkClickStats' | 'getSearchConversionStats'
    >
  >;

  const req = {
    user: { id: 'user-id' },
  } as Parameters<AnalyticsController['getProfileViews']>[0];

  beforeEach(() => {
    analyticsService = {
      getProfileViewStats: jest.fn(),
      getLinkClickStats: jest.fn(),
      getSearchConversionStats: jest.fn(),
    };

    controller = new AnalyticsController(
      analyticsService as unknown as AnalyticsService,
    );
  });

  it('GET /analytics/profile-views passes the authenticated user id and range through', async () => {
    const result = {
      total: 20,
      range_total: 5,
      unique_viewers: 4,
      daily_breakdown: [{ date: '2026-07-21', views: 2 }],
    };
    analyticsService.getProfileViewStats.mockResolvedValue(result);

    await expect(
      controller.getProfileViews(req, { range: '7d' }),
    ).resolves.toEqual(result);

    expect(analyticsService.getProfileViewStats).toHaveBeenCalledWith(
      'user-id',
      '7d',
    );
  });

  it('GET /analytics/link-clicks passes the authenticated user id and range through', async () => {
    const result = {
      range_total: 9,
      links: [{ linkUrl: 'https://example.com', clicks: 9 }],
    };
    analyticsService.getLinkClickStats.mockResolvedValue(result);

    await expect(
      controller.getLinkClicks(req, { range: '90d' }),
    ).resolves.toEqual(result);

    expect(analyticsService.getLinkClickStats).toHaveBeenCalledWith(
      'user-id',
      '90d',
    );
  });

  it('GET /analytics/search-conversions passes the authenticated user id and range through', async () => {
    const result = {
      searches_surfaced: 10,
      search_driven_views: 3,
      conversion_rate: 0.3,
    };
    analyticsService.getSearchConversionStats.mockResolvedValue(result);

    await expect(
      controller.getSearchConversions(req, { range: '30d' }),
    ).resolves.toEqual(result);

    expect(analyticsService.getSearchConversionStats).toHaveBeenCalledWith(
      'user-id',
      '30d',
    );
  });

  it('enforces JwtAuthGuard on analytics routes', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        AnalyticsController.prototype.getProfileViews,
      ),
    ).toContain(JwtAuthGuard);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        AnalyticsController.prototype.getLinkClicks,
      ),
    ).toContain(JwtAuthGuard);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        AnalyticsController.prototype.getSearchConversions,
      ),
    ).toContain(JwtAuthGuard);
  });
});
