import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyMetric } from './entities/daily-metric.entity';
import { RollupProgress } from './entities/rollup-progress.entity';
import { ThirtyDayMetric } from './entities/thirty-day-metric.entity';
import { WeeklyMetric } from './entities/weekly-metric.entity';
import { QueueModule } from '../queue/queue.module';
import { MetricsRollupProcessor } from './processors/metrics-rollup.processor';
import { MetricsRollupService } from './services/metrics-rollup.service';
import { RollupScheduler } from './services/rollup-scheduler.service';
import { DailyMetricAction } from './actions/daily-metric.action';
import { RollupProgressAction } from './actions/rollup-progress.action';
import { AdminMetricsController } from './admin-metrics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyMetric,
      WeeklyMetric,
      ThirtyDayMetric,
      RollupProgress,
    ]),
    QueueModule,
  ],
  controllers: [AdminMetricsController],
  providers: [
    DailyMetricAction,
    RollupProgressAction,
    MetricsRollupService,
    MetricsRollupProcessor,
    RollupScheduler,
  ],
  exports: [TypeOrmModule, MetricsRollupService],
})
export class AdminModule {}
