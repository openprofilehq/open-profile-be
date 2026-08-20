import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MetricType } from '../enums/metric-type.enum';

@Entity('daily_metrics')
@Index(
  'IDX_daily_metrics_metricType_periodDate',
  ['metricType', 'periodDate'],
  {
    unique: true,
  },
)
export class DailyMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: MetricType })
  metricType: MetricType;

  @Column({ type: 'date' })
  periodDate: string;

  @Column({ type: 'bigint', default: 0 })
  count: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
