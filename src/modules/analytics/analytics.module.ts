import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileView } from './entities/profile-view.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { Profile } from '../profile/entities/profile.entity';
import { RedisModule } from '../../common/redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { ProfileEvent } from './entities/profile-event.entity';
import { LinkClick } from './entities/link-click.entity';
import { SearchImpression } from './entities/search-impression.entity';
import { MetricSnapshot } from './entities/metric-snapshot.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProfileView,
      Profile,
      ProfileEvent,
      LinkClick,
      SearchImpression,
      MetricSnapshot,
    ]),
    RedisModule,
    AuthModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule { }
