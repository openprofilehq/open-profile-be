import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProfileComponent } from './profile-component.entity';

@Entity('profiles')
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index({ unique: true })
  @Column({ unique: true })
  username: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ nullable: true, type: 'text' })
  bio: string | null;

  @Column({ type: 'varchar', name: 'photo_url', nullable: true })
  photoUrl: string | null;

  @Column({ type: 'varchar', name: 'template_type', nullable: true })
  templateType: string | null;

  @Column({ name: 'theme_settings', nullable: true, type: 'jsonb' })
  themeSettings: Record<string, unknown> | null;

  @Column({ type: 'boolean', name: 'is_searchable', default: true })
  isSearchable: boolean;

  @Column({ type: 'boolean', name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({ type: 'boolean', name: 'is_published', default: false })
  isPublished: boolean;

  @OneToMany(() => ProfileComponent, (component) => component.profile)
  components: ProfileComponent[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
