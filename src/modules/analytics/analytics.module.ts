import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { ProfileView } from './entities/profile-view.entity';
import { Profile } from '../profile/entities/profile.entity';
import { RedisModule } from '../../common/redis/redis.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([ProfileView, Profile]), RedisModule,AuthModule, ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
