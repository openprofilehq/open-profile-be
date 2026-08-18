import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyMetric } from './entities/daily-metric.entity';
import { WeeklyMetric } from './entities/weekly-metric.entity';
import { ThirtyDayMetric } from './entities/thirty-day-metric.entity';
import { RollupProgress } from './entities/rollup-progress.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyMetric,
      WeeklyMetric,
      ThirtyDayMetric,
      RollupProgress,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class AdminModule {}
