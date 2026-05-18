import {
  Entity,
  Column,
  PrimaryColumn,
  Index,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { Profile } from '../../profile/entities/profile.entity';

@Entity('profile_views')
@Index('idx_profile_views_profile_viewed_at', ['profileId', 'viewedAt'])
@Index('idx_profile_views_dedup', ['dedupKey'], { unique: true })
export class ProfileView {
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv7();
    }
  }

  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profile_id' })
  profile: Profile;

  @Column({ name: 'viewer_ip', type: 'varchar', length: 45 })
  viewerIp: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string;

  @Column({
    name: 'viewed_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  viewedAt: Date;

  @Column({ name: 'dedup_key', type: 'varchar', length: 128 })
  dedupKey: string;

  @Column({ name: 'viewer_id', type: 'uuid', nullable: true, default: null })
  viewerId: string | null;

  @Column({ name: 'is_unique', type: 'boolean', default: false })
  isUnique: boolean;
}
