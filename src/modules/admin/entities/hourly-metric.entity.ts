import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MetricType } from '../enums/metric-type.enum';

@Entity('hourly_metrics')
@Index(
  'IDX_hourly_metrics_metricType_periodStart',
  ['metricType', 'periodStart'],
  {
    unique: true,
  },
)
export class HourlyMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: MetricType })
  metricType: MetricType;

  @Column({ type: 'timestamptz' })
  periodStart: Date;

  @Column({ type: 'bigint', default: 0 })
  count: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
