import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HourlyMetric } from './entities/hourly-metric.entity';
import { DailyMetric } from './entities/daily-metric.entity';
import { RollupProgress } from './entities/rollup-progress.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([HourlyMetric, DailyMetric, RollupProgress]),
  ],
  exports: [TypeOrmModule],
})
export class AdminModule {}
