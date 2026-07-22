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

@Entity('education')
@Index(['profileId', 'displayOrder'])
export class Education {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'profile_id' })
  profileId: string;

  @ManyToOne(() => Profile, (profile) => profile.education, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profile_id' })
  profile: Profile;

  @Column({ type: 'varchar', length: 150 })
  school: string;

  @Column({ type: 'varchar', length: 150 })
  degree: string;

  @Column({ type: 'varchar', name: 'field_of_study', length: 150 })
  fieldOfStudy: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  location: string | null;

  @Column({ type: 'text', name: 'activities_honors', nullable: true })
  activitiesHonors: string | null;

  @Column({ type: 'int', name: 'start_year' })
  startYear: number;

  @Column({ type: 'int', name: 'end_year' })
  endYear: number;

  @Column({ type: 'int', name: 'display_order' })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
