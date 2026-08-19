import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { UserStatus } from '../../users/entities/user.entity';

@Entity('user_status_history')
export class UserStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: UserStatus, name: 'from_status' })
  fromStatus: UserStatus;

  @Column({ type: 'enum', enum: UserStatus, name: 'to_status' })
  toStatus: UserStatus;

  @Column({ type: 'uuid', name: 'changed_by', nullable: true })
  changedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'changed_by' })
  changedByUser: User | null;

  @Column({ type: 'timestamptz', name: 'changed_at', default: () => 'now()' })
  changedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
