import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyMetric } from './entities/daily-metric.entity';
import { RollupProgress } from './entities/rollup-progress.entity';
import { ThirtyDayMetric } from './entities/thirty-day-metric.entity';
import { WeeklyMetric } from './entities/weekly-metric.entity';
import { UserStatusHistory } from './entities/user-status-history.entity';
import { PlatformDailySnapshot } from './entities/platform-daily-snapshot.entity';
import { User } from '../users/entities/user.entity';
import { Invite } from '../invites/entities/invite.entity';
import { QueueModule } from '../queue/queue.module';
import { MetricsRollupProcessor } from './processors/metrics-rollup.processor';
import { MetricsRollupService } from './services/metrics-rollup.service';
import { RollupScheduler } from './services/rollup-scheduler.service';
import { PlatformSnapshotService } from './services/platform-snapshot.service';
import { AccountStatusService } from './services/account-status.service';
import { AdminMetricsService } from './services/admin-metrics.service';
import { DailyMetricAction } from './actions/daily-metric.action';
import { RollupProgressAction } from './actions/rollup-progress.action';
import { PlatformSnapshotAction } from './actions/platform-snapshot.action';
import { InviteMetricAction } from './actions/invite-metric.action';
import { AdminMetricsController } from './admin-metrics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyMetric,
      WeeklyMetric,
      ThirtyDayMetric,
      RollupProgress,
      UserStatusHistory,
      PlatformDailySnapshot,
      User,
      Invite,
    ]),
    QueueModule,
  ],
  controllers: [AdminMetricsController],
  providers: [
    DailyMetricAction,
    RollupProgressAction,
    PlatformSnapshotAction,
    InviteMetricAction,
    MetricsRollupService,
    PlatformSnapshotService,
    AccountStatusService,
    AdminMetricsService,
    MetricsRollupProcessor,
    RollupScheduler,
  ],
  exports: [TypeOrmModule, MetricsRollupService, AccountStatusService],
})
export class AdminModule {}
