import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

export enum AuthProvider {
  EMAIL = 'email',
  GOOGLE = 'google',
}

@Entity('users')
export class User {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Exclude()
  @Column({ type: 'varchar', length: 255 })
  password: string;

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', length: 255, name: 'full_name', nullable: true })
  fullName: string | null;

  @ApiProperty({ example: 'john-doe', nullable: true })
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 30, unique: true, nullable: true })
  username: string | null;

  @ApiProperty({ nullable: true })
  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', length: 500, name: 'photo_url', nullable: true })
  photoUrl: string | null;

  @ApiProperty({ default: false })
  @Column({ type: 'boolean', name: 'is_published', default: false })
  isPublished: boolean;

  @ApiProperty({ enum: UserRole, nullable: true, default: null })
  @Column({ type: 'enum', enum: UserRole, nullable: true, default: null })
  role: UserRole | null;

  @ApiProperty({ enum: AuthProvider, default: AuthProvider.EMAIL })
  @Column({
    type: 'varchar',
    length: 50,
    name: 'auth_provider',
    default: AuthProvider.EMAIL,
  })
  authProvider: AuthProvider;

  @ApiProperty({ default: false })
  @Column({ type: 'boolean', name: 'is_verified', default: false })
  isVerified: boolean;

  @ApiProperty({ default: false })
  @Column({ type: 'boolean', name: 'onboarding_complete', default: false })
  onboardingComplete: boolean;

  @Exclude()
  @Column({ type: 'varchar', length: 255, name: 'otp_hash', nullable: true })
  otpHash: string | null;

  @Exclude()
  @Column({
    type: 'timestamp with time zone',
    name: 'otp_expires_at',
    nullable: true,
  })
  otpExpiresAt: Date | null;

  @Exclude()
  @Column({
    type: 'varchar',
    length: 45,
    nullable: true,
    name: 'last_login_ip',
  })
  lastLoginIp: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Exclude()
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
