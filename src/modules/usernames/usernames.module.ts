import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from '../profile/entities/profile.entity';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { UsernameRateLimitGuard } from './guards/username-rate-limit.guard';
import { UsernamesController } from './usernames.controller';
import { UsernamesService } from './usernames.service';

@Module({
  imports: [TypeOrmModule.forFeature([Profile]), RateLimiterModule],
  controllers: [UsernamesController],
  providers: [UsernamesService, UsernameRateLimitGuard],
  exports: [UsernamesService],
})
export class UsernamesModule {}
