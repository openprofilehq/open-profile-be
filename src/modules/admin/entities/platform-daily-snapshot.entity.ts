import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('platform_daily_snapshot')
export class PlatformDailySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'date', name: 'period_date', unique: true })
  periodDate: string;

  @Column({ type: 'int', name: 'total_users', default: 0 })
  totalUsers: number;

  @Column({ type: 'int', name: 'published_profiles', default: 0 })
  publishedProfiles: number;

  @Column({
    type: 'numeric',
    name: 'profile_completion_rate',
    precision: 5,
    scale: 2,
    default: 0,
  })
  profileCompletionRate: number;

  @Column({ type: 'int', name: 'weekly_active_profiles', default: 0 })
  weeklyActiveProfiles: number;

  @Column({ type: 'int', name: 'new_users_today', default: 0 })
  newUsersToday: number;

  @Column({ type: 'int', name: 'profiles_published_today', default: 0 })
  profilesPublishedToday: number;

  @Column({ type: 'int', name: 'flagged_for_review', default: 0 })
  flaggedForReview: number;

  @Column({ type: 'int', name: 'active_suspensions', default: 0 })
  activeSuspensions: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
