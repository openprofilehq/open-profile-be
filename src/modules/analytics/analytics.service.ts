import {
  Injectable,
  ForbiddenException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { ProfileView } from './entities/profile-view.entity';
import { Profile } from '../profile/entities/profile.entity';

import { AnalyticsStatsDto } from './dto/analytics-stats.dto';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(ProfileView)
    private readonly viewRepo: Repository<ProfileView>,

    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,

    private readonly redis: RedisService,
  ) {}

  async getStats(userId: string): Promise<AnalyticsStatsDto> {
    
      // Find user's profile
     
    const profile = await this.profileRepo.findOne({
      where: {
        userId,
      },
    });

    if (!profile) {
      throw new ForbiddenException('Profile not found');
    }

    
    //  Redis cache check
     
    const cacheKey = `analytics:stats:${profile.id}`;

    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    
    // Time boundaries (UTC)
     
    const now = new Date();

    const startOfToday = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      ),
    );

    const startOfWeek = new Date(now);

    startOfWeek.setUTCDate(now.getUTCDate() - 7);

    const startOf30Days = new Date(now);

    startOf30Days.setUTCDate(now.getUTCDate() - 29);

    
    //  Total views
     
    const total = await this.viewRepo.count({
      where: {
        profileId: profile.id,
      },
    });

    
      //  Today's views
     
    const today = await this.viewRepo
      .createQueryBuilder('view')
      .where('view.profile_id = :profileId', {
        profileId: profile.id,
      })
      .andWhere('view.viewed_at >= :today', {
        today: startOfToday,
      })
      .getCount();

    
      // This week's views
     
    const thisWeek = await this.viewRepo
      .createQueryBuilder('view')
      .where('view.profile_id = :profileId', {
        profileId: profile.id,
      })
      .andWhere('view.viewed_at >= :week', {
        week: startOfWeek,
      })
      .getCount();

    
    // Unique viewers
     
    const uniqueViewersRaw = await this.viewRepo
      .createQueryBuilder('view')
      .select('COUNT(DISTINCT view.viewer_ip)', 'count')
      .where('view.profile_id = :profileId', {
        profileId: profile.id,
      })
      .getRawOne();

    const unique_viewers = Number(uniqueViewersRaw?.count ?? 0);

    
    // Daily breakdown (last 30 days)
     
    const rows = await this.viewRepo
      .createQueryBuilder('view')
      .select(`DATE(view.viewed_at)`, 'date')
      .addSelect('COUNT(*)', 'views')
      .where('view.profile_id = :profileId', {
        profileId: profile.id,
      })
      .andWhere('view.viewed_at >= :startDate', {
        startDate: startOf30Days,
      })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();

    
    // Convert DB rows into map
     
    const map = new Map<string, number>();

    for (const row of rows) {
      map.set(row.date, Number(row.views));
    }

    
    // Fill missing zero-view days
     
    const daily_breakdown: {
      date: string;
      views: number;
    }[] = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);

      d.setUTCDate(now.getUTCDate() - i);

      const key = d.toISOString().split('T')[0];

      daily_breakdown.push({
        date: key,
        views: map.get(key) || 0,
      });
    }

    
    // Final response
     
    const result: AnalyticsStatsDto = {
      total,
      today,
      this_week: thisWeek,
      unique_viewers,
      daily_breakdown,
    };

    
    // Cache for 60 seconds
     
    await this.redis.set(
      cacheKey,
      JSON.stringify(result),
      60,
    );

    return result;
  }
}