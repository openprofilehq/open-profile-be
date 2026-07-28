import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('invites')
@Index(
  'IDX_invites_pending_inviter_recipient',
  ['inviterUserId', 'recipientEmail'],
  {
    unique: true,
    where: '"claimedAt" IS NULL',
  },
)
export class Invite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  inviterUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inviterUserId' })
  inviter: User;

  @Column()
  recipientEmail: string;

  @Column()
  token: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  clickedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  claimedByUserId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
