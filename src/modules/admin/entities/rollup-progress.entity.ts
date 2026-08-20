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
  lastHourlyRollupAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastDailyRollupAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
