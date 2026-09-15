import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MetricType } from '../enums/metric-type.enum';

@Entity('thirty_day_metrics')
@Index(
  'IDX_thirty_day_metrics_metricType_periodEnd',
  ['metricType', 'periodEnd'],
  {
    unique: true,
  },
)
export class ThirtyDayMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: MetricType })
  metricType: MetricType;

  @Column({ type: 'date' })
  periodEnd: string;

  @Column({ type: 'bigint', default: 0 })
  count: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
