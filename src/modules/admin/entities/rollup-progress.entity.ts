import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export const ROLLUP_PROGRESS_ID = 'singleton';

@Entity('rollup_progress')
export class RollupProgress {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastDailyRollupAt: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'success' })
  lastDailyRollupStatus: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastWeeklyRollupAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastThirtyDayRollupAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSnapshotAt: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'success' })
  lastSnapshotStatus: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
