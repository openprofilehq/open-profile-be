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
@Index(['token'], { unique: true })
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

  @Column({ unique: true })
  token: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  // Set when the recipient lands on the pre-filled signup page —
  // distinct from claimedAt, which only fires on successful signup.
  // Lets analytics report the click-through vs. completion funnel
  // separately instead of collapsing both into one event.
  @Column({ type: 'timestamptz', nullable: true })
  clickedAt: Date | null;

  // Set only when signup actually completes through this invite —
  // this is the "conversion" moment per the ticket's decision.
  @Column({ type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  claimedByUserId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
