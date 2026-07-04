import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('failed_events')
export class FailedEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column()
  errorMessage: string;

  @Column({ type: 'varchar', nullable: true })
  errorCode: string | null;

  @Column({ default: 0 })
  attemptCount: number;

  @Column({ default: false })
  resolved: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  failedAt: Date;
}
