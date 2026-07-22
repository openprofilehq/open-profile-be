import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Profile } from './profile.entity';

@Entity('work_experience')
@Index(['profileId', 'displayOrder'])
export class WorkExperience {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'profile_id' })
  profileId: string;

  @ManyToOne(() => Profile, (profile) => profile.workExperience, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profile_id' })
  profile: Profile;

  @Column({ type: 'varchar', length: 150, name: 'company_name' })
  companyName: string;

  @Column({ type: 'varchar', length: 150, name: 'job_title' })
  jobTitle: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  location: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', name: 'start_month' })
  startMonth: number;

  @Column({ type: 'int', name: 'start_year' })
  startYear: number;

  @Column({ type: 'int', name: 'end_month', nullable: true })
  endMonth: number | null;

  @Column({ type: 'int', name: 'end_year', nullable: true })
  endYear: number | null;

  @Column({ type: 'boolean', name: 'is_current', default: false })
  isCurrent: boolean;

  @Column({ type: 'int', name: 'display_order' })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
