import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileContentDto, SectionType } from './profile-content.dto';
import { ThemeSettings } from './theme-settings.dto';
import { AppearanceSettingsDto } from './appearance-settings.dto';

export class ProfileResponseDto {
  @ApiProperty({ example: '8b59d8f1-45bb-4bc9-84e0-6d5dbdc17c4a' })
  id: string;

  @ApiProperty({ example: 'calvin' })
  username: string;

  @ApiProperty({ example: 'Calvin Iordye' })
  fullName: string;

  @ApiPropertyOptional({
    example: 'Backend engineer building OpenProfile',
    nullable: true,
  })
  bio: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/avatar.jpg',
    nullable: true,
  })
  photoUrl: string | null;

  @ApiPropertyOptional({ example: 'developer', nullable: true })
  templateType: string | null;

  @ApiPropertyOptional({ type: () => ThemeSettings, nullable: true })
  themeSettings: ThemeSettings | null;

  @ApiPropertyOptional({ example: 'Hire Me', nullable: true })
  ctaLabel: string | null;

  @ApiPropertyOptional({
    example: 'https://calvin.dev/contact',
    nullable: true,
  })
  ctaUrl: string | null;

  @ApiProperty({ example: true })
  isPublished: boolean;

  @ApiProperty({ example: false })
  hasUnpublishedChanges: boolean;

  @ApiProperty({ example: false })
  isVerified: boolean;

  @ApiProperty({ example: true })
  isPublic: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ComponentItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  sectionType: string;

  @ApiPropertyOptional({ nullable: true })
  title: string | null;

  @ApiPropertyOptional({ nullable: true })
  content: string | null;

  @ApiProperty()
  displayOrder: number;

  @ApiProperty()
  isEnabled: boolean;

  @ApiPropertyOptional({ nullable: true })
  metadata: Record<string, unknown> | null;
}

export class SkillResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'TypeScript' })
  name: string;

  @ApiPropertyOptional({ example: 'intermediate', nullable: true })
  level: string | null;

  @ApiProperty({ example: 0 })
  displayOrder: number;
}

export class EducationResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'University of Lagos' })
  school: string;

  @ApiProperty({ example: 'B.Sc.' })
  degree: string;

  @ApiProperty({ example: 'Microbiology' })
  fieldOfStudy: string;

  @ApiPropertyOptional({ example: 'Lagos, Nigeria', nullable: true })
  location: string | null;

  @ApiPropertyOptional({ nullable: true })
  activitiesHonors: string | null;

  @ApiProperty({ example: 2016 })
  startYear: number;

  @ApiProperty({ example: 2020 })
  endYear: number;

  @ApiProperty({ example: 0 })
  displayOrder: number;
}

export class WorkExperienceResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'Anthropic' })
  companyName: string;

  @ApiProperty({ example: 'Backend Engineer' })
  jobTitle: string;

  @ApiPropertyOptional({ example: 'Abuja, Nigeria', nullable: true })
  location: string | null;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty({ example: 3 })
  startMonth: number;

  @ApiProperty({ example: 2023 })
  startYear: number;

  @ApiPropertyOptional({ example: 8, nullable: true })
  endMonth: number | null;

  @ApiPropertyOptional({ example: 2024, nullable: true })
  endYear: number | null;

  @ApiProperty({ example: false })
  isCurrent: boolean;

  @ApiProperty({ example: 0 })
  displayOrder: number;
}

export class AwardResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'Best Backend Engineer' })
  title: string;

  @ApiProperty({ example: 'HNG Internship' })
  issuer: string;

  @ApiProperty({ example: '2024-06-15' })
  awardDate: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({
    example: 'https://credential.example.com/verify/abc123',
    nullable: true,
  })
  credentialUrl: string | null;

  @ApiProperty({ example: 0 })
  displayOrder: number;
}

export class SectionMetaDto {
  @ApiProperty({ example: 'education', enum: SectionType })
  type: SectionType;

  @ApiProperty({ example: 2 })
  displayOrder: number;
}

export class DashboardProfileResponseDto extends ProfileResponseDto {
  @ApiProperty({ type: [ComponentItemDto] })
  components: ComponentItemDto[];

  @ApiProperty({ type: [SkillResponseDto] })
  skills: SkillResponseDto[];

  @ApiProperty({ type: [EducationResponseDto] })
  education: EducationResponseDto[];

  @ApiProperty({ type: [WorkExperienceResponseDto] })
  workExperience: WorkExperienceResponseDto[];

  @ApiProperty({ type: [AwardResponseDto] })
  awards: AwardResponseDto[];
}

export class PublicProfileResponseDto {
  @ApiProperty({ example: 'calvin' })
  username: string;

  @ApiPropertyOptional({ example: 'Calvin Iordye', nullable: true })
  fullName: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/avatar.jpg',
    nullable: true,
  })
  photoUrl: string | null;

  @ApiPropertyOptional({ example: 'developer', nullable: true })
  templateType: string | null;

  @ApiPropertyOptional({ type: () => ThemeSettings, nullable: true })
  themeSettings: ThemeSettings | null;

  @ApiPropertyOptional({ type: () => AppearanceSettingsDto, nullable: true })
  appearance: AppearanceSettingsDto | null;

  @ApiPropertyOptional({ type: () => ProfileContentDto, nullable: true })
  content: ProfileContentDto | null;

  @ApiProperty({ type: [SkillResponseDto] })
  skills: SkillResponseDto[];

  @ApiProperty({ type: [EducationResponseDto] })
  education: EducationResponseDto[];

  @ApiProperty({ type: [WorkExperienceResponseDto] })
  workExperience: WorkExperienceResponseDto[];

  @ApiProperty({ type: [AwardResponseDto] })
  awards: AwardResponseDto[];

  @ApiProperty({ type: [SectionMetaDto] })
  sections: SectionMetaDto[];
}
