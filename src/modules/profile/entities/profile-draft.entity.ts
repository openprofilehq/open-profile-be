import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Profile } from './profile.entity';
import { ProfileContentDto } from '../dto/profile-content.dto';
import { ThemeSettings } from '../dto/theme-settings.dto';
import { AppearanceSettingsDto } from '../dto/appearance-settings.dto';

@Entity('profile_drafts')
export class ProfileDraft {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'profile_id', unique: true })
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_id' })
  profile: Profile;

  @Column({ nullable: true, type: 'text' })
  username: string | null;

  @Column({ name: 'full_name', nullable: true, type: 'text' })
  fullName: string | null;

  @Column({ nullable: true, type: 'text' })
  bio: string | null;

  @Column({ type: 'varchar', name: 'photo_url', nullable: true })
  photoUrl: string | null;

  @Column({ type: 'jsonb', nullable: true })
  content: ProfileContentDto | null;

  @Column({ type: 'jsonb', nullable: true })
  appearance: AppearanceSettingsDto | null;

  @Column({ name: 'theme_settings', nullable: true, type: 'jsonb' })
  themeSettings: ThemeSettings | null;

  @Column({ type: 'varchar', name: 'template_type', nullable: true })
  templateType: string | null;

  @Column({ type: 'varchar', name: 'cta_label', nullable: true })
  ctaLabel: string | null;

  @Column({ type: 'varchar', name: 'cta_url', nullable: true })
  ctaUrl: string | null;
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
