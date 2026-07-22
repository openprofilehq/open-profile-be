import { PatchComponentDto } from './dto/patch-component.dto';
import { ReorderComponentsDto } from './dto/reorder-components.dto';
import { ComponentSetMismatchException } from './exceptions/component-set-mismatch.exception';
import { User } from '../users/entities/user.entity';
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository, DataSource, In } from 'typeorm';
import * as crypto from 'crypto';
import { RedisService } from '../../common/redis/redis.service';
import { Profile } from './entities/profile.entity';
import { ProfileComponent } from './entities/profile-component.entity';
import { ProfileDraft } from './entities/profile-draft.entity';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UsernamesService } from '../usernames/usernames.service';
import { UpsertDraftDto } from './dto/upsert-draft.dto';
import { ProfileDraftResponseDto } from './dto/profile-draft-response.dto';
import { CtaDto, CtaType, ProfileContentDto } from './dto/profile-content.dto';
import {
  ProfileResponseDto,
  DashboardProfileResponseDto,
  PublicProfileResponseDto,
  SectionMetaDto,
} from './dto/profile-response.dto';
import { AppearanceSettingsDto } from './dto/appearance-settings.dto';
import { DEFAULT_APPEARANCE } from './constants/default-appearance';
import { LinkItemDto } from './dto/profile-content.dto';
import { SectionType } from './dto/profile-content.dto';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { Skill } from './entities/skill.entity';
import { WorkExperience } from './entities/work-experience.entity';
import { Award } from './entities/award.entity';
import {
  CreateAwardDto,
  UpdateAwardDto,
  ReorderAwardsDto,
} from './dto/award.dto';
import {
  CreateWorkExperienceDto,
  UpdateWorkExperienceDto,
  ReorderWorkExperienceDto,
} from './dto/work-experience.dto';
import {
  CreateSkillDto,
  UpdateSkillDto,
  ReorderSkillsDto,
} from './dto/skill.dto';
import { Education } from './entities/education.entity';
import {
  CreateEducationDto,
  UpdateEducationDto,
  ReorderEducationDto,
} from './dto/education.dto';
import {
  sanitizeUrl,
  isValidUrl,
  encodeUrlForBackend,
} from './utils/link.utils';
import dns from 'node:dns/promises';
const CACHE_TTL_SECONDS = 60;
const CACHE_404_TTL_SECONDS = 30;

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,
    @InjectRepository(ProfileComponent)
    private readonly componentRepo: Repository<ProfileComponent>,
    @InjectRepository(Skill)
    private readonly skillRepo: Repository<Skill>,
    @InjectRepository(Education)
    private readonly educationRepo: Repository<Education>,
    @InjectRepository(WorkExperience)
    private readonly workExperienceRepo: Repository<WorkExperience>,
    @InjectRepository(Award)
    private readonly awardRepo: Repository<Award>,
    @InjectRepository(ProfileDraft)
    private readonly profileDraftRepo: Repository<ProfileDraft>,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
    private readonly usernamesService: UsernamesService,
  ) {}

  private toProfileResponse(profile: Profile): ProfileResponseDto {
    return {
      id: profile.id,
      username: profile.username,
      fullName: profile.fullName,
      bio: profile.bio,
      photoUrl: profile.photoUrl,
      templateType: profile.templateType,
      themeSettings: profile.themeSettings,
      ctaLabel: profile.ctaLabel,
      ctaUrl: profile.ctaUrl,
      isPublished: profile.isPublished,
      hasUnpublishedChanges: profile.hasUnpublishedChanges,
      isVerified: profile.isVerified,
      isPublic: profile.isPublic,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  async createProfile(
    createProfileDto: CreateProfileDto,
    user: AuthenticatedUser,
  ): Promise<ProfileResponseDto> {
    // Step 1 - check if user already has a profile
    const existingProfile = await this.profileRepo.findOne({
      where: { userId: user.sub },
    });

    if (existingProfile) {
      throw new ConflictException('User already has a profile');
    }

    // Step 2 - validate username (format, reserved words, availability)
    const usernameCheck = await this.usernamesService.check(
      createProfileDto.username,
    );

    if (!usernameCheck.available) {
      if (usernameCheck.reason === 'TAKEN') {
        throw new ConflictException('Username already taken');
      }
      throw new UnprocessableEntityException({
        error: 'INVALID_USERNAME_FORMAT',
        message:
          'Username must be 3-30 characters, use only letters, numbers, and hyphens, and must not start, end, or contain consecutive hyphens.',
      });
    }

    // Step 3 - create and save the profile
    const profile = this.profileRepo.create({
      userId: user.sub,
      username: usernameCheck.normalizedUsername, // already trimmed + lowercased by UsernamesService
      fullName: createProfileDto.fullName,
      bio: createProfileDto.bio,
      photoUrl: createProfileDto.photoUrl,
      isPublished: createProfileDto.isPublished ?? true,
    });

    // Step 8 - persist profile + flip onboarding flag atomically.
    // If either write fails the transaction rolls back, leaving the user
    // in a clean state where they can retry without hitting a conflict.
    const savedProfile = await this.dataSource.transaction(async (manager) => {
      const txProfileRepo = manager.getRepository(Profile);
      const txUserRepo = manager.getRepository(User);
      const txComponentRepo = manager.getRepository(ProfileComponent);

      const saved = await txProfileRepo.save(profile);

      const updateResult = await txUserRepo.update(
        { id: user.sub },
        { onboardingComplete: true },
      );

      if (updateResult.affected !== 1) {
        throw new NotFoundException('User not found');
      }

      const defaultSections = [
        SectionType.BIO,
        SectionType.LINKS,
        SectionType.PROJECTS,
        SectionType.CTA,
        SectionType.WORK_EXPERIENCE,
        SectionType.EDUCATION,
        SectionType.SKILLS,
        SectionType.AWARDS,
      ];

      const defaultComponents = defaultSections.map((sectionType, index) =>
        txComponentRepo.create({
          profileId: saved.id,
          sectionType,
          isEnabled: true,
          displayOrder: index,
        }),
      );
      await txComponentRepo.save(defaultComponents);

      return saved;
    });

    return this.toProfileResponse(savedProfile);
  }

  async getPublicProfile(username: string): Promise<{
    profileId: string;
    userId: string;
    data: PublicProfileResponseDto;
    etag: string;
    fromCache: boolean;
  }> {
    const normalizedUsername = username.toLowerCase();
    const cacheKey = `profile:${normalizedUsername}`;
    const lockKey = `profile:lock:${normalizedUsername}`;

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as PublicProfileResponseDto & {
        profileId?: string;
        userId?: string;
      };
      if (parsed['__notFound']) {
        throw new NotFoundException({
          error: 'not_found',
          message: 'Profile not found',
        });
      }
      const etag = this.computeEtag(cached);

      // Strip internal fields before returning as the public `data` payload
      const { profileId, userId, ...publicData } = parsed;

      return {
        profileId: profileId ?? '',
        userId: userId ?? '',
        data: publicData,
        etag,
        fromCache: true,
      };
    }

    // Single-flight lock — prevents cache stampede on cold cache.
    const lockAcquired = await this.redisService.set(
      lockKey,
      '1',
      CACHE_TTL_SECONDS,
      true,
    );

    try {
      const profile = await this.profileRepo.findOne({
        where: {
          username: normalizedUsername,
          isPublished: true,
          isPublic: true,
          deletedAt: IsNull(),
        },
        relations: ['user'],
      });

      if (!profile) {
        await this.redisService.set(
          cacheKey,
          JSON.stringify({ __notFound: true }),
          CACHE_404_TTL_SECONDS,
        );
        throw new NotFoundException({
          error: 'not_found',
          message: 'Profile not found',
        });
      }

      const [skills, education, workExperience, awards, components] =
        await Promise.all([
          this.skillRepo.find({
            where: { profileId: profile.id },
            order: { displayOrder: 'ASC' },
          }),
          this.educationRepo.find({
            where: { profileId: profile.id },
            order: { displayOrder: 'ASC' },
          }),
          this.workExperienceRepo.find({
            where: { profileId: profile.id },
            order: { displayOrder: 'ASC' },
          }),
          this.awardRepo.find({
            where: { profileId: profile.id },
            order: { displayOrder: 'ASC' },
          }),
          this.componentRepo.find({
            where: { profileId: profile.id },
            order: { displayOrder: 'ASC' },
          }),
        ]);
      const responseData = this.serialize(
        profile,
        skills,
        education,
        components,
        workExperience,
        awards,
      );
      const cachePayload = {
        profileId: profile.id,
        userId: profile.userId,
        ...responseData,
      };
      const serialized = JSON.stringify(cachePayload);

      this.logger.log(`Cache miss for profile: ${normalizedUsername}`);

      // Re-check visibility flags immediately before writing the cache. If a
      // toggle-to-private (save + invalidateCache) lands between the read
      // above and here, this prevents writing back a stale public payload
      // that would outlive the invalidation for up to CACHE_TTL_SECONDS. The
      // in-flight response below was built from a legitimately-public read
      // and is still returned — only the cache write is skipped.
      const currentFlags = await this.profileRepo.findOne({
        where: { id: profile.id },
        select: ['isPublished', 'isPublic', 'deletedAt'],
      });
      const stillPublic =
        !!currentFlags &&
        currentFlags.isPublished &&
        currentFlags.isPublic &&
        !currentFlags.deletedAt;

      if (stillPublic) {
        await this.redisService.set(cacheKey, serialized, CACHE_TTL_SECONDS);
      }

      const etag = this.computeEtag(serialized);

      return {
        profileId: profile.id,
        userId: profile.userId,
        data: responseData,
        etag,
        fromCache: false,
      };
    } finally {
      if (lockAcquired) {
        await this.redisService.del(lockKey);
      }
    }
  }

  async getDashboardProfile(
    userId: string,
  ): Promise<DashboardProfileResponseDto> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });

    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete your profile setup.',
      );
    }

    const [skills, education, workExperience, awards, components] =
      await Promise.all([
        this.skillRepo.find({
          where: { profileId: profile.id },
          order: { displayOrder: 'ASC' },
        }),
        this.educationRepo.find({
          where: { profileId: profile.id },
          order: { displayOrder: 'ASC' },
        }),
        this.workExperienceRepo.find({
          where: { profileId: profile.id },
          order: { displayOrder: 'ASC' },
        }),
        this.awardRepo.find({
          where: { profileId: profile.id },
          order: { displayOrder: 'ASC' },
        }),
        this.componentRepo.find({
          where: { profileId: profile.id },
          order: { displayOrder: 'ASC' },
        }),
      ]);
    return {
      ...this.toProfileResponse(profile),
      components: components.map((c) => ({
        id: c.id,
        sectionType: c.sectionType,
        title: c.title,
        content: c.content,
        displayOrder: c.displayOrder,
        isEnabled: c.isEnabled,
        metadata: c.metadata,
      })),
      skills: skills.map((s) => ({
        id: s.id,
        name: s.name,
        level: s.level,
        displayOrder: s.displayOrder,
      })),
      education: education.map((e) => ({
        id: e.id,
        school: e.school,
        degree: e.degree,
        fieldOfStudy: e.fieldOfStudy,
        location: e.location,
        activitiesHonors: e.activitiesHonors,
        startYear: e.startYear,
        endYear: e.endYear,
        displayOrder: e.displayOrder,
      })),
      workExperience: workExperience.map((w) => ({
        id: w.id,
        companyName: w.companyName,
        jobTitle: w.jobTitle,
        location: w.location,
        description: w.description,
        startMonth: w.startMonth,
        startYear: w.startYear,
        endMonth: w.endMonth,
        endYear: w.endYear,
        isCurrent: w.isCurrent,
        displayOrder: w.displayOrder,
      })),
      awards: awards.map((a) => ({
        id: a.id,
        title: a.title,
        issuer: a.issuer,
        awardDate: a.awardDate,
        description: a.description,
        credentialUrl: a.credentialUrl,
        displayOrder: a.displayOrder,
      })),
    };
  }

  async invalidateCache(username: string): Promise<void> {
    await this.redisService.del(`profile:${username.toLowerCase()}`);
  }

  async updateVisibility(
    userId: string,
    isPublic: boolean,
  ): Promise<{ isPublic: boolean }> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });

    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }

    if (profile.isPublic === isPublic) {
      return { isPublic };
    }

    profile.isPublic = isPublic;
    const saved = await this.profileRepo.save(profile);
    await this.invalidateCache(saved.username);

    return { isPublic: saved.isPublic };
  }

  private serialize(
    profile: Profile,
    skills: Skill[] = [],
    education: Education[] = [],
    components: ProfileComponent[] = [],
    workExperience: WorkExperience[] = [],
    awards: Award[] = [],
  ): PublicProfileResponseDto {
    const isEnabled = (type: SectionType): boolean => {
      const component = components.find(
        (c) => c.sectionType === (type as string),
      );
      // No ProfileComponent row for this type (shouldn't happen post-seeding-fix,
      // but fail open rather than hide data due to a missing row) → treat as enabled.
      return component ? component.isEnabled : true;
    };

    const defaultContent: ProfileContentDto = {
      sectionOrder: [
        SectionType.BIO,
        SectionType.LINKS,
        SectionType.PROJECTS,
        SectionType.CTA,
      ],
      bio: { visible: true, content: profile.bio ?? '' },
      links: { visible: true, sectionTitle: 'Links', items: [] },
      projects: { visible: true, sectionTitle: 'Projects', items: [] },
      cta: {
        visible: true,
        type: CtaType.LINK,
        label: profile.ctaLabel ?? '',
        value: profile.ctaUrl ?? null,
        title: "Let's build something",
        subtitle: '',
        layout: '1',
        iconId: null,
        iconSrc: null,
        iconLabel: null,
      },
    };

    const rawCta: Partial<CtaDto> & {
      type?: CtaType;
      url?: string | null;
    } = profile.content?.cta ?? {};

    const content: ProfileContentDto = {
      ...defaultContent,
      ...(profile.content ?? {}),
      bio: {
        ...defaultContent.bio,
        ...(profile.content?.bio ?? {}),
      },
      links: {
        ...defaultContent.links,
        ...(profile.content?.links ?? {}),
      },
      projects: {
        ...defaultContent.projects,
        ...(profile.content?.projects ?? {}),
      },
      cta: {
        ...defaultContent.cta,
        ...rawCta,
        type: rawCta.type ?? CtaType.LINK,
        value:
          rawCta.type === CtaType.EMAIL
            ? (rawCta.value ?? null)
            : (rawCta.value ?? rawCta.url ?? null),
      },
    };

    // Strip disabled sections' raw data — sections array alone isn't enough,
    // since a client reading the raw fields directly (bypassing `sections`)
    // should not see data for a section the owner has turned off.
    if (!isEnabled(SectionType.BIO)) {
      content.bio = { ...defaultContent.bio, visible: false, content: '' };
    }
    if (!isEnabled(SectionType.LINKS)) {
      content.links = { ...defaultContent.links, visible: false, items: [] };
    }
    if (!isEnabled(SectionType.PROJECTS)) {
      content.projects = {
        ...defaultContent.projects,
        visible: false,
        items: [],
      };
    }
    if (!isEnabled(SectionType.CTA)) {
      content.cta = { ...defaultContent.cta, visible: false, value: null };
    }

    const sections: SectionMetaDto[] = components
      .filter((c) => c.isEnabled)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((c) => ({
        type: c.sectionType as SectionType,
        displayOrder: c.displayOrder,
      }));

    return {
      username: profile.username,
      fullName: profile.fullName ?? null,
      photoUrl: profile.photoUrl,
      templateType: profile.templateType,
      themeSettings: profile.themeSettings,
      appearance: profile.appearance,
      content,
      skills: isEnabled(SectionType.SKILLS)
        ? skills.map((s) => ({
            id: s.id,
            name: s.name,
            level: s.level,
            displayOrder: s.displayOrder,
          }))
        : [],
      education: isEnabled(SectionType.EDUCATION)
        ? education.map((e) => ({
            id: e.id,
            school: e.school,
            degree: e.degree,
            fieldOfStudy: e.fieldOfStudy,
            location: e.location,
            activitiesHonors: e.activitiesHonors,
            startYear: e.startYear,
            endYear: e.endYear,
            displayOrder: e.displayOrder,
          }))
        : [],
      workExperience: isEnabled(SectionType.WORK_EXPERIENCE)
        ? workExperience.map((w) => ({
            id: w.id,
            companyName: w.companyName,
            jobTitle: w.jobTitle,
            location: w.location,
            description: w.description,
            startMonth: w.startMonth,
            startYear: w.startYear,
            endMonth: w.endMonth,
            endYear: w.endYear,
            isCurrent: w.isCurrent,
            displayOrder: w.displayOrder,
          }))
        : [],
      awards: isEnabled(SectionType.AWARDS)
        ? awards.map((a) => ({
            id: a.id,
            title: a.title,
            issuer: a.issuer,
            awardDate: a.awardDate,
            description: a.description,
            credentialUrl: a.credentialUrl,
            displayOrder: a.displayOrder,
          }))
        : [],
      sections,
    };
  }
  private computeEtag(content: string): string {
    return `"${crypto.createHash('md5').update(content).digest('hex')}"`;
  }

  /**
   * PATCH /profiles/me/components/:componentId
   *
   * Patches one component owned by the authenticated user. Ownership is
   * checked by walking componentId → profile.id → profile.userId. Cache
   * for the owning profile's username is invalidated on success.
   */
  async patchComponent(
    userId: string,
    componentId: string,
    dto: PatchComponentDto,
  ): Promise<ProfileComponent> {
    const component = await this.componentRepo.findOne({
      where: { id: componentId },
    });
    if (!component) {
      throw new NotFoundException(`Component ${componentId} not found.`);
    }

    const profile = await this.profileRepo.findOne({
      where: { id: component.profileId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException(`Component ${componentId} not found.`);
    }
    if (profile.userId !== userId) {
      throw new ForbiddenException(
        'Component does not belong to the authenticated user.',
      );
    }

    // Apply only the fields the DTO actually carries — never blindly
    // spread, which would overwrite columns with undefined.
    if (dto.isEnabled !== undefined) component.isEnabled = dto.isEnabled;
    if (dto.title !== undefined) component.title = dto.title;
    if (dto.content !== undefined) component.content = dto.content;
    if (dto.metadata !== undefined) component.metadata = dto.metadata;

    const saved = await this.componentRepo.save(component);
    await this.invalidateCache(profile.username);
    return saved;
  }

  /**
   * PUT /profiles/me/components/order
   *
   * Replaces the full ordering of components for the authenticated user's
   * profile in a single transaction.
   *
   * Algorithm:
   *   1. Resolve user → profile (outside the txn, read-only).
   *   2. BEGIN TXN.
   *   3. SELECT … FOR UPDATE locks all components of this profile —
   *      concurrent reorders for the same profile serialize.
   *   4. Verify submitted ID set equals locked set exactly. Cross-profile
   *      IDs → 403. Missing or extra IDs → 409 with a diff.
   *   5. One UPDATE … FROM (VALUES …) writes the new displayOrder values
   *      in a single statement (parameterised, never interpolated).
   *   6. COMMIT.
   *
   * Why pessimistic locking: no version column on components, and the
   * retry-loop UX of optimistic locking is bad for drag-and-drop. Profile-
   * scoped contention is near-zero (one editor per profile).
   */
  async reorderComponents(
    userId: string,
    dto: ReorderComponentsDto,
  ): Promise<ProfileComponent[]> {
    const submittedIds = dto.componentIds;

    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found for user.');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const componentsRepo = manager.getRepository(ProfileComponent);

      const currentComponents = await componentsRepo
        .createQueryBuilder('c')
        .where('c.profile_id = :profileId', { profileId: profile.id })
        .setLock('pessimistic_write')
        .getMany();

      const currentIds = new Set(currentComponents.map((c) => c.id));
      const submittedSet = new Set(submittedIds);

      // Cross-profile check: any submitted ID that exists in the DB but
      // on a different profile → 403, not 409.
      const foreignIds = submittedIds.filter((id) => !currentIds.has(id));
      if (foreignIds.length > 0) {
        const foreignRows = await componentsRepo.find({
          where: { id: In(foreignIds) },
          select: ['id'],
        });
        if (foreignRows.length > 0) {
          throw new ForbiddenException(
            'One or more componentIds belong to a different profile.',
          );
        }
      }

      const missing = [...currentIds].filter((id) => !submittedSet.has(id));
      const extra = submittedIds.filter((id) => !currentIds.has(id));
      if (missing.length > 0 || extra.length > 0) {
        throw new ComponentSetMismatchException(missing, extra);
      }

      if (submittedIds.length === 0) {
        return [];
      }

      // One UPDATE statement, N rows. Parameterised values list.
      const values = submittedIds
        .map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::int)`)
        .join(', ');
      const params: (string | number)[] = [];
      submittedIds.forEach((id, i) => {
        params.push(id, i);
      });
      await manager.query(
        `UPDATE components AS c
         SET display_order = v.new_order, updated_at = NOW()
         FROM (VALUES ${values}) AS v(id, new_order)
         WHERE c.id = v.id`,
        params,
      );

      return componentsRepo
        .createQueryBuilder('c')
        .where('c.profile_id = :profileId', { profileId: profile.id })
        .orderBy('c.display_order', 'ASC')
        .getMany();
    });

    await this.invalidateCache(profile.username);
    this.logger.log(
      `Reordered ${result.length} components for profile ${profile.id}`,
    );
    return result;
  }

  // ─────────────────────────────────────────────
  // Skills
  // ─────────────────────────────────────────────

  private async getOwnedSkill(
    userId: string,
    skillId: string,
  ): Promise<{ skill: Skill; profile: Profile }> {
    const skill = await this.skillRepo.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException(`Skill ${skillId} not found.`);
    }

    const profile = await this.profileRepo.findOne({
      where: { id: skill.profileId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException(`Skill ${skillId} not found.`);
    }
    if (profile.userId !== userId) {
      throw new ForbiddenException(
        'Skill does not belong to the authenticated user.',
      );
    }

    return { skill, profile };
  }

  async createSkill(userId: string, dto: CreateSkillDto): Promise<Skill> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }

    const maxResult = await this.skillRepo
      .createQueryBuilder('s')
      .select('MAX(s.displayOrder)', 'max')
      .where('s.profileId = :profileId', { profileId: profile.id })
      .getRawOne<{ max: number | null }>();

    const max = maxResult?.max ?? null;

    const skill = this.skillRepo.create({
      profileId: profile.id,
      name: dto.name,
      level: dto.level ?? null,
      displayOrder: (max ?? -1) + 1,
    });

    const saved = await this.skillRepo.save(skill);
    await this.invalidateCache(profile.username);
    return saved;
  }

  async listSkills(userId: string): Promise<Skill[]> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }
    return this.skillRepo.find({
      where: { profileId: profile.id },
      order: { displayOrder: 'ASC' },
    });
  }

  async updateSkill(
    userId: string,
    skillId: string,
    dto: UpdateSkillDto,
  ): Promise<Skill> {
    const { skill, profile } = await this.getOwnedSkill(userId, skillId);

    if (dto.name !== undefined) skill.name = dto.name;
    if (dto.level !== undefined) skill.level = dto.level;

    const saved = await this.skillRepo.save(skill);
    await this.invalidateCache(profile.username);
    return saved;
  }

  async deleteSkill(userId: string, skillId: string): Promise<void> {
    const { skill, profile } = await this.getOwnedSkill(userId, skillId);
    await this.skillRepo.remove(skill);
    await this.invalidateCache(profile.username);
  }

  /**
   * PUT /profiles/me/skills/order
   * Same pessimistic-lock + set-mismatch pattern as reorderComponents.
   */
  async reorderSkills(userId: string, dto: ReorderSkillsDto): Promise<Skill[]> {
    const submittedIds = dto.skillIds;

    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found for user.');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const skillsRepo = manager.getRepository(Skill);

      const currentSkills = await skillsRepo
        .createQueryBuilder('s')
        .where('s.profile_id = :profileId', { profileId: profile.id })
        .setLock('pessimistic_write')
        .getMany();

      const currentIds = new Set(currentSkills.map((s) => s.id));
      const submittedSet = new Set(submittedIds);

      const foreignIds = submittedIds.filter((id) => !currentIds.has(id));
      if (foreignIds.length > 0) {
        const foreignRows = await skillsRepo.find({
          where: { id: In(foreignIds) },
          select: ['id'],
        });
        if (foreignRows.length > 0) {
          throw new ForbiddenException(
            'One or more skillIds belong to a different profile.',
          );
        }
      }
      const missing = [...currentIds].filter((id) => !submittedSet.has(id));
      const extra = submittedIds.filter((id) => !currentIds.has(id));
      if (missing.length > 0 || extra.length > 0) {
        throw new ComponentSetMismatchException(missing, extra);
      }

      if (submittedIds.length === 0) {
        return [];
      }

      const values = submittedIds
        .map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::int)`)
        .join(', ');
      const params: (string | number)[] = [];
      submittedIds.forEach((id, i) => params.push(id, i));

      await manager.query(
        `UPDATE skills AS s
         SET display_order = v.new_order, updated_at = NOW()
         FROM (VALUES ${values}) AS v(id, new_order)
         WHERE s.id = v.id`,
        params,
      );

      return skillsRepo
        .createQueryBuilder('s')
        .where('s.profile_id = :profileId', { profileId: profile.id })
        .orderBy('s.display_order', 'ASC')
        .getMany();
    });

    await this.invalidateCache(profile.username);
    this.logger.log(
      `Reordered ${result.length} skills for profile ${profile.id}`,
    );
    return result;
  }

  // ─────────────────────────────────────────────
  // Education
  // ─────────────────────────────────────────────

  private async getOwnedEducation(
    userId: string,
    educationId: string,
  ): Promise<{ education: Education; profile: Profile }> {
    const education = await this.educationRepo.findOne({
      where: { id: educationId },
    });
    if (!education) {
      throw new NotFoundException(`Education entry ${educationId} not found.`);
    }

    const profile = await this.profileRepo.findOne({
      where: { id: education.profileId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException(`Education entry ${educationId} not found.`);
    }
    if (profile.userId !== userId) {
      throw new ForbiddenException(
        'Education entry does not belong to the authenticated user.',
      );
    }

    return { education, profile };
  }

  async createEducation(
    userId: string,
    dto: CreateEducationDto,
  ): Promise<Education> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }

    const { max } = (await this.educationRepo
      .createQueryBuilder('e')
      .select('MAX(e.displayOrder)', 'max')
      .where('e.profileId = :profileId', { profileId: profile.id })
      .getRawOne<{ max: number | null }>()) ?? { max: null };

    const education = this.educationRepo.create({
      profileId: profile.id,
      school: dto.school,
      degree: dto.degree,
      fieldOfStudy: dto.fieldOfStudy,
      location: dto.location ?? null,
      activitiesHonors: dto.activitiesHonors ?? null,
      startYear: dto.startYear,
      endYear: dto.endYear,
      displayOrder: (max ?? -1) + 1,
    });

    const saved = await this.educationRepo.save(education);
    await this.invalidateCache(profile.username);
    return saved;
  }

  async listEducation(userId: string): Promise<Education[]> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }
    return this.educationRepo.find({
      where: { profileId: profile.id },
      order: { displayOrder: 'ASC' },
    });
  }

  async updateEducation(
    userId: string,
    educationId: string,
    dto: UpdateEducationDto,
  ): Promise<Education> {
    const { education, profile } = await this.getOwnedEducation(
      userId,
      educationId,
    );

    if (dto.school !== undefined) education.school = dto.school;
    if (dto.degree !== undefined) education.degree = dto.degree;
    if (dto.fieldOfStudy !== undefined)
      education.fieldOfStudy = dto.fieldOfStudy;
    if (dto.location !== undefined) education.location = dto.location;
    if (dto.activitiesHonors !== undefined)
      education.activitiesHonors = dto.activitiesHonors;
    if (dto.startYear !== undefined) education.startYear = dto.startYear;
    if (dto.endYear !== undefined) education.endYear = dto.endYear;

    // DTO-level @Validate only checks fields present in the same request body.
    // Re-check here against the fully merged entity, since a lone startYear
    // PATCH could otherwise make endYear (unchanged, from the DB) invalid.
    if (education.endYear < education.startYear) {
      throw new UnprocessableEntityException({
        error: 'INVALID_DATE_RANGE',
        message: 'endYear must be greater than or equal to startYear.',
      });
    }

    const saved = await this.educationRepo.save(education);
    await this.invalidateCache(profile.username);
    return saved;
  }

  async deleteEducation(userId: string, educationId: string): Promise<void> {
    const { education, profile } = await this.getOwnedEducation(
      userId,
      educationId,
    );
    await this.educationRepo.remove(education);
    await this.invalidateCache(profile.username);
  }

  async reorderEducation(
    userId: string,
    dto: ReorderEducationDto,
  ): Promise<Education[]> {
    const submittedIds = dto.educationIds;

    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found for user.');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const educationRepo = manager.getRepository(Education);

      const currentEducation = await educationRepo
        .createQueryBuilder('e')
        .where('e.profile_id = :profileId', { profileId: profile.id })
        .setLock('pessimistic_write')
        .getMany();

      const currentIds = new Set(currentEducation.map((e) => e.id));
      const submittedSet = new Set(submittedIds);

      const foreignIds = submittedIds.filter((id) => !currentIds.has(id));
      if (foreignIds.length > 0) {
        const foreignRows = await educationRepo.find({
          where: { id: In(foreignIds) },
          select: ['id'],
        });
        if (foreignRows.length > 0) {
          throw new ForbiddenException(
            'One or more educationIds belong to a different profile.',
          );
        }
      }

      const missing = [...currentIds].filter((id) => !submittedSet.has(id));
      const extra = submittedIds.filter((id) => !currentIds.has(id));
      if (missing.length > 0 || extra.length > 0) {
        throw new ComponentSetMismatchException(missing, extra);
      }

      if (submittedIds.length === 0) {
        return [];
      }

      const values = submittedIds
        .map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::int)`)
        .join(', ');
      const params: (string | number)[] = [];
      submittedIds.forEach((id, i) => params.push(id, i));

      await manager.query(
        `UPDATE education AS e
         SET display_order = v.new_order, updated_at = NOW()
         FROM (VALUES ${values}) AS v(id, new_order)
         WHERE e.id = v.id`,
        params,
      );

      return educationRepo
        .createQueryBuilder('e')
        .where('e.profile_id = :profileId', { profileId: profile.id })
        .orderBy('e.display_order', 'ASC')
        .getMany();
    });

    await this.invalidateCache(profile.username);
    this.logger.log(
      `Reordered ${result.length} education entries for profile ${profile.id}`,
    );
    return result;
  }

  // ─────────────────────────────────────────────
  // Work Experience
  // ─────────────────────────────────────────────

  private validateWorkExperienceDates(entity: WorkExperience): void {
    if (entity.isCurrent) {
      if (entity.endMonth != null || entity.endYear != null) {
        throw new UnprocessableEntityException({
          error: 'INVALID_DATE_RANGE',
          message: 'endMonth/endYear must be empty when isCurrent is true.',
        });
      }
      return;
    }

    if (entity.endMonth == null || entity.endYear == null) {
      throw new UnprocessableEntityException({
        error: 'INVALID_DATE_RANGE',
        message: 'endMonth and endYear are required when isCurrent is false.',
      });
    }

    const startsAfterEnds =
      entity.endYear < entity.startYear ||
      (entity.endYear === entity.startYear &&
        entity.endMonth < entity.startMonth);

    if (startsAfterEnds) {
      throw new UnprocessableEntityException({
        error: 'INVALID_DATE_RANGE',
        message: 'End date must be on or after start date.',
      });
    }
  }

  private async getOwnedWorkExperience(
    userId: string,
    workExperienceId: string,
  ): Promise<{ workExperience: WorkExperience; profile: Profile }> {
    const workExperience = await this.workExperienceRepo.findOne({
      where: { id: workExperienceId },
    });
    if (!workExperience) {
      throw new NotFoundException(
        `Work experience ${workExperienceId} not found.`,
      );
    }

    const profile = await this.profileRepo.findOne({
      where: { id: workExperience.profileId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException(
        `Work experience ${workExperienceId} not found.`,
      );
    }
    if (profile.userId !== userId) {
      throw new ForbiddenException(
        'Work experience does not belong to the authenticated user.',
      );
    }

    return { workExperience, profile };
  }

  async createWorkExperience(
    userId: string,
    dto: CreateWorkExperienceDto,
  ): Promise<WorkExperience> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }

    const { max } = (await this.workExperienceRepo
      .createQueryBuilder('w')
      .select('MAX(w.displayOrder)', 'max')
      .where('w.profileId = :profileId', { profileId: profile.id })
      .getRawOne<{ max: number | null }>()) ?? { max: null };

    const workExperience = this.workExperienceRepo.create({
      profileId: profile.id,
      companyName: dto.companyName,
      jobTitle: dto.jobTitle,
      location: dto.location ?? null,
      description: dto.description ?? null,
      startMonth: dto.startMonth,
      startYear: dto.startYear,
      endMonth: dto.isCurrent ? null : (dto.endMonth ?? null),
      endYear: dto.isCurrent ? null : (dto.endYear ?? null),
      isCurrent: dto.isCurrent,
      displayOrder: (max ?? -1) + 1,
    });

    this.validateWorkExperienceDates(workExperience);

    const saved = await this.workExperienceRepo.save(workExperience);
    await this.invalidateCache(profile.username);
    return saved;
  }

  async listWorkExperience(userId: string): Promise<WorkExperience[]> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }
    return this.workExperienceRepo.find({
      where: { profileId: profile.id },
      order: { displayOrder: 'ASC' },
    });
  }

  async updateWorkExperience(
    userId: string,
    workExperienceId: string,
    dto: UpdateWorkExperienceDto,
  ): Promise<WorkExperience> {
    const { workExperience, profile } = await this.getOwnedWorkExperience(
      userId,
      workExperienceId,
    );

    if (dto.companyName !== undefined)
      workExperience.companyName = dto.companyName;
    if (dto.jobTitle !== undefined) workExperience.jobTitle = dto.jobTitle;
    if (dto.location !== undefined) workExperience.location = dto.location;
    if (dto.description !== undefined)
      workExperience.description = dto.description;
    if (dto.startMonth !== undefined)
      workExperience.startMonth = dto.startMonth;
    if (dto.startYear !== undefined) workExperience.startYear = dto.startYear;
    if (dto.isCurrent !== undefined) workExperience.isCurrent = dto.isCurrent;

    // endMonth/endYear: apply explicitly-sent values, but also clear them
    // if isCurrent was just flipped to true in this same request.
    if (dto.endMonth !== undefined) workExperience.endMonth = dto.endMonth;
    if (dto.endYear !== undefined) workExperience.endYear = dto.endYear;
    if (workExperience.isCurrent) {
      workExperience.endMonth = null;
      workExperience.endYear = null;
    }

    // Re-validate against the fully merged entity — catches cases where
    // only one of isCurrent/endMonth/endYear was sent in this PATCH but
    // the merged result is inconsistent with what's already stored.
    this.validateWorkExperienceDates(workExperience);

    const saved = await this.workExperienceRepo.save(workExperience);
    await this.invalidateCache(profile.username);
    return saved;
  }

  async deleteWorkExperience(
    userId: string,
    workExperienceId: string,
  ): Promise<void> {
    const { workExperience, profile } = await this.getOwnedWorkExperience(
      userId,
      workExperienceId,
    );
    await this.workExperienceRepo.remove(workExperience);
    await this.invalidateCache(profile.username);
  }

  async reorderWorkExperience(
    userId: string,
    dto: ReorderWorkExperienceDto,
  ): Promise<WorkExperience[]> {
    const submittedIds = dto.workExperienceIds;

    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found for user.');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const workExperienceRepo = manager.getRepository(WorkExperience);

      const currentEntries = await workExperienceRepo
        .createQueryBuilder('w')
        .where('w.profile_id = :profileId', { profileId: profile.id })
        .setLock('pessimistic_write')
        .getMany();

      const currentIds = new Set(currentEntries.map((w) => w.id));
      const submittedSet = new Set(submittedIds);

      const foreignIds = submittedIds.filter((id) => !currentIds.has(id));
      if (foreignIds.length > 0) {
        const foreignRows = await workExperienceRepo.find({
          where: { id: In(foreignIds) },
          select: ['id'],
        });
        if (foreignRows.length > 0) {
          throw new ForbiddenException(
            'One or more workExperienceIds belong to a different profile.',
          );
        }
      }

      const missing = [...currentIds].filter((id) => !submittedSet.has(id));
      const extra = submittedIds.filter((id) => !currentIds.has(id));
      if (missing.length > 0 || extra.length > 0) {
        throw new ComponentSetMismatchException(missing, extra);
      }

      if (submittedIds.length === 0) {
        return [];
      }

      const values = submittedIds
        .map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::int)`)
        .join(', ');
      const params: (string | number)[] = [];
      submittedIds.forEach((id, i) => params.push(id, i));

      await manager.query(
        `UPDATE work_experience AS w
         SET display_order = v.new_order, updated_at = NOW()
         FROM (VALUES ${values}) AS v(id, new_order)
         WHERE w.id = v.id`,
        params,
      );

      return workExperienceRepo
        .createQueryBuilder('w')
        .where('w.profile_id = :profileId', { profileId: profile.id })
        .orderBy('w.display_order', 'ASC')
        .getMany();
    });

    await this.invalidateCache(profile.username);
    this.logger.log(
      `Reordered ${result.length} work experience entries for profile ${profile.id}`,
    );
    return result;
  }

  // ─────────────────────────────────────────────
  // Awards
  // ─────────────────────────────────────────────

  private async getOwnedAward(
    userId: string,
    awardId: string,
  ): Promise<{ award: Award; profile: Profile }> {
    const award = await this.awardRepo.findOne({ where: { id: awardId } });
    if (!award) {
      throw new NotFoundException(`Award ${awardId} not found.`);
    }

    const profile = await this.profileRepo.findOne({
      where: { id: award.profileId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException(`Award ${awardId} not found.`);
    }
    if (profile.userId !== userId) {
      throw new ForbiddenException(
        'Award does not belong to the authenticated user.',
      );
    }

    return { award, profile };
  }

  async createAward(userId: string, dto: CreateAwardDto): Promise<Award> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }

    const { max } = (await this.awardRepo
      .createQueryBuilder('a')
      .select('MAX(a.displayOrder)', 'max')
      .where('a.profileId = :profileId', { profileId: profile.id })
      .getRawOne<{ max: number | null }>()) ?? { max: null };

    const award = this.awardRepo.create({
      profileId: profile.id,
      title: dto.title,
      issuer: dto.issuer,
      awardDate: dto.awardDate,
      description: dto.description ?? null,
      credentialUrl: dto.credentialUrl ?? null,
      displayOrder: (max ?? -1) + 1,
    });

    const saved = await this.awardRepo.save(award);
    await this.invalidateCache(profile.username);
    return saved;
  }

  async listAwards(userId: string): Promise<Award[]> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }
    return this.awardRepo.find({
      where: { profileId: profile.id },
      order: { displayOrder: 'ASC' },
    });
  }

  async updateAward(
    userId: string,
    awardId: string,
    dto: UpdateAwardDto,
  ): Promise<Award> {
    const { award, profile } = await this.getOwnedAward(userId, awardId);

    if (dto.title !== undefined) award.title = dto.title;
    if (dto.issuer !== undefined) award.issuer = dto.issuer;
    if (dto.awardDate !== undefined) award.awardDate = dto.awardDate;
    if (dto.description !== undefined) award.description = dto.description;
    if (dto.credentialUrl !== undefined)
      award.credentialUrl = dto.credentialUrl;

    const saved = await this.awardRepo.save(award);
    await this.invalidateCache(profile.username);
    return saved;
  }

  async deleteAward(userId: string, awardId: string): Promise<void> {
    const { award, profile } = await this.getOwnedAward(userId, awardId);
    await this.awardRepo.remove(award);
    await this.invalidateCache(profile.username);
  }

  async reorderAwards(userId: string, dto: ReorderAwardsDto): Promise<Award[]> {
    const submittedIds = dto.awardIds;

    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found for user.');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const awardRepo = manager.getRepository(Award);

      const currentAwards = await awardRepo
        .createQueryBuilder('a')
        .where('a.profile_id = :profileId', { profileId: profile.id })
        .setLock('pessimistic_write')
        .getMany();

      const currentIds = new Set(currentAwards.map((a) => a.id));
      const submittedSet = new Set(submittedIds);

      const foreignIds = submittedIds.filter((id) => !currentIds.has(id));
      if (foreignIds.length > 0) {
        const foreignRows = await awardRepo.find({
          where: { id: In(foreignIds) },
          select: ['id'],
        });
        if (foreignRows.length > 0) {
          throw new ForbiddenException(
            'One or more awardIds belong to a different profile.',
          );
        }
      }

      const missing = [...currentIds].filter((id) => !submittedSet.has(id));
      const extra = submittedIds.filter((id) => !currentIds.has(id));
      if (missing.length > 0 || extra.length > 0) {
        throw new ComponentSetMismatchException(missing, extra);
      }

      if (submittedIds.length === 0) {
        return [];
      }

      const values = submittedIds
        .map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::int)`)
        .join(', ');
      const params: (string | number)[] = [];
      submittedIds.forEach((id, i) => params.push(id, i));

      await manager.query(
        `UPDATE awards AS a
         SET display_order = v.new_order, updated_at = NOW()
         FROM (VALUES ${values}) AS v(id, new_order)
         WHERE a.id = v.id`,
        params,
      );

      return awardRepo
        .createQueryBuilder('a')
        .where('a.profile_id = :profileId', { profileId: profile.id })
        .orderBy('a.display_order', 'ASC')
        .getMany();
    });

    await this.invalidateCache(profile.username);
    this.logger.log(
      `Reordered ${result.length} awards for profile ${profile.id}`,
    );
    return result;
  }

  async updateProfile(
    username: string,
    dto: UpdateProfileDto,
    userId: string,
  ): Promise<ProfileResponseDto> {
    const profile = await this.profileRepo.findOne({
      where: { username: username.toLowerCase(), deletedAt: IsNull() },
    });

    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }

    if (profile.userId !== userId) {
      throw new ForbiddenException(
        "You don't have permission to update this profile.",
      );
    }

    if (dto.fullName !== undefined) profile.fullName = dto.fullName;
    if (dto.bio !== undefined) profile.bio = dto.bio;
    if (dto.photoUrl !== undefined) profile.photoUrl = dto.photoUrl;

    profile.hasUnpublishedChanges = true;

    const saved = await this.profileRepo.save(profile);
    await this.invalidateCache(saved.username);

    return this.toProfileResponse(saved);
  }

  async publishProfile(userId: string) {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });

    if (!profile) {
      throw new NotFoundException('Complete onboarding before publishing.');
    }

    const result = await this.dataSource.transaction(async (tx) => {
      const draftRepo = tx.getRepository(ProfileDraft);
      const profileRepo = tx.getRepository(Profile);

      const draft = await draftRepo.findOne({
        where: { profileId: profile.id },
      });

      if (!draft) {
        return {
          status: 'success',
          message: 'Profile is already up to date. Nothing to publish.',
          data: {
            profileId: profile.id,
            username: profile.username,
            publishedAt: profile.updatedAt.toISOString(),
          },
        };
      }

      // 1. Validate visible link items
      const linkItems =
        draft.content?.links?.items ?? profile.content?.links?.items ?? [];
      if (linkItems.some((i) => i.visible)) {
        await this.validateLinkItems(linkItems);
      }

      // Validate CTA — catches drafts that predate CTA validation
      const cta = draft.content?.cta;
      if (cta) {
        this.validateCtaContent(cta);
      }

      const updatedProfile = profileRepo.create({
        ...profile,
        bio: draft.bio ?? profile.bio,
        photoUrl: draft.photoUrl ?? profile.photoUrl,
        content: draft.content ?? profile.content,
        fullName: draft.fullName ?? profile.fullName,
        themeSettings: draft.themeSettings ?? profile.themeSettings,
        appearance: draft.appearance ?? profile.appearance,
        isPublished: true,
        updatedAt: new Date(),
      });

      await profileRepo.save(updatedProfile);

      await draftRepo.delete({ profileId: profile.id });

      return {
        status: 'success',
        message: 'Profile published successfully',
        data: {
          profileId: profile.id,
          username: profile.username,
          publishedAt: new Date().toISOString(),
        },
      };
    });

    await this.invalidateCache(profile.username);
    await this.redisService.del(`profile:links:${profile.id}`);

    return result;
  }

  async getProfileContent(userId: string): Promise<ProfileDraftResponseDto> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });

    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }

    const draft = await this.profileDraftRepo.findOne({
      where: { profileId: profile.id },
    });

    const baseContent: ProfileContentDto = {
      sectionOrder: [
        SectionType.BIO,
        SectionType.LINKS,
        SectionType.PROJECTS,
        SectionType.CTA,
      ],
      bio: { visible: true, content: profile.bio ?? '' },
      links: { visible: true, sectionTitle: 'Links', items: [] },
      projects: { visible: true, sectionTitle: 'Projects', items: [] },
      cta: {
        visible: true,
        type: CtaType.LINK,
        label: profile.ctaLabel ?? '',
        value: profile.ctaUrl ?? null,
      },
    };

    const rawCta: Partial<CtaDto> & {
      url?: string | null;
    } = draft?.content?.cta ?? profile.content?.cta ?? {};

    const content: ProfileContentDto = {
      ...baseContent,
      ...(profile.content ?? {}),
      ...(draft?.content ?? {}),
      bio: {
        ...baseContent.bio,
        ...(profile.content?.bio ?? {}),
        ...(draft?.content?.bio ?? {}),
      },
      links: {
        ...baseContent.links,
        ...(profile.content?.links ?? {}),
        ...(draft?.content?.links ?? {}),
      },
      projects: {
        ...baseContent.projects,
        ...(profile.content?.projects ?? {}),
        ...(draft?.content?.projects ?? {}),
      },
      cta: {
        ...baseContent.cta,
        ...(profile.content?.cta ?? {}),
        ...(draft?.content?.cta ?? {}),
        type: rawCta.type ?? CtaType.LINK,
        value:
          rawCta.type === CtaType.EMAIL
            ? (rawCta.value ?? null)
            : (rawCta.value ?? rawCta.url ?? null),
      },
    };

    return {
      profileId: profile.id,
      bio: draft?.bio ?? profile.bio ?? null,
      photoUrl: draft?.photoUrl ?? profile.photoUrl ?? null,
      content,
      themeSettings: draft?.themeSettings ?? profile.themeSettings ?? null,
      appearance: draft?.appearance ?? profile.appearance ?? null,
      source: draft ? 'draft' : 'published',
      updatedAt: draft?.updatedAt ?? profile.updatedAt,
    };
  }

  private validateCtaContent(cta: Partial<CtaDto>): void {
    if (cta.visible === false) return;

    const effectiveType = cta.type ?? CtaType.LINK;

    if (effectiveType === CtaType.EMAIL) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!cta.value || !emailRegex.test(cta.value.trim())) {
        throw new UnprocessableEntityException({
          error: 'INVALID_CTA',
          message: 'CTA email must be a valid email address.',
        });
      }
    } else if (
      effectiveType === CtaType.PHONE ||
      effectiveType === CtaType.WHATSAPP
    ) {
      if (
        !cta.value ||
        cta.value !== cta.value.trim() ||
        !isValidPhoneNumber(cta.value)
      ) {
        throw new UnprocessableEntityException({
          error: 'INVALID_CTA',
          message:
            'CTA phone number must be a valid international phone number (e.g. +2348012345678).',
        });
      }
    } else {
      if (!cta.value) return;
      let parsed: URL;
      try {
        parsed = new URL(cta.value);
      } catch {
        throw new UnprocessableEntityException({
          error: 'INVALID_CTA',
          message: 'CTA URL is not a valid URL.',
        });
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new UnprocessableEntityException({
          error: 'INVALID_CTA',
          message: 'CTA URL must use http or https.',
        });
      }
    }
  }

  validateLink(
    url: string,
    iconId?: string,
  ): {
    original: string;
    sanitized: string;
    encoded: string;
  } {
    const sanitized = sanitizeUrl(url);

    if (sanitized === '#') {
      throw new UnprocessableEntityException({
        error: 'DANGEROUS_URL',
        message: 'URL contains a dangerous scheme and cannot be used.',
      });
    }

    if (!isValidUrl(sanitized, iconId)) {
      throw new UnprocessableEntityException({
        error: 'INVALID_URL',
        message: 'Invalid URL format.',
      });
    }

    return {
      original: url,
      sanitized,
      encoded: encodeUrlForBackend(sanitized, iconId),
    };
  }

  private async validateLinkItems(items: LinkItemDto[]): Promise<void> {
    const visibleItems = items.filter((item) => item.visible);

    if (visibleItems.length === 0) return;

    const results = await Promise.all(
      visibleItems.map(async (item) => {
        try {
          const { hostname, protocol } = new URL(item.url);

          // 1. Protocol validation
          if (!['http:', 'https:'].includes(protocol)) {
            return `"${item.label}" uses unsupported protocol`;
          }

          // 2. SSRF protection via DNS lookup
          const lookupResult = await dns.lookup(hostname);
          const address =
            lookupResult && typeof lookupResult === 'object'
              ? ((lookupResult as { address?: string }).address ?? '')
              : typeof lookupResult === 'string'
                ? lookupResult
                : '';

          const addr = String(address ?? '');

          if (!addr) {
            return `"${item.label}" has an invalid URL`;
          }

          const ipv4MappedMatch = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
          if (ipv4MappedMatch) {
            const mappedIp = ipv4MappedMatch[1];
            const mappedParts = mappedIp.split('.').map(Number);
            const isMappedPrivate =
              mappedIp.startsWith('127.') ||
              mappedIp.startsWith('10.') ||
              mappedIp.startsWith('192.168.') ||
              mappedIp.startsWith('169.254.') ||
              (mappedParts[0] === 172 &&
                mappedParts[1] >= 16 &&
                mappedParts[1] <= 31);
            if (isMappedPrivate) {
              return `"${item.label}" points to a private network`;
            }
          }

          const ipParts = addr.split('.').map(Number);

          const isPrivateIpv6 =
            addr === '::1' ||
            /^fe80:/i.test(addr) ||
            /^fc[0-9a-f]{2}:/i.test(addr) ||
            /^fd[0-9a-f]{2}:/i.test(addr);

          const isPrivate =
            isPrivateIpv6 ||
            addr.startsWith('127.') ||
            addr.startsWith('10.') ||
            addr.startsWith('192.168.') ||
            addr.startsWith('169.254.') ||
            (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31);

          if (isPrivate) {
            return `"${item.label}" points to a private network`;
          }

          return null;
        } catch {
          return `"${item.label}" has an invalid URL`;
        }
      }),
    );

    const failures = results.filter(Boolean) as string[];

    if (failures.length > 0) {
      throw new UnprocessableEntityException({
        error: 'INVALID_LINKS',
        message:
          'One or more links could not be verified. Please check the URLs and try again.',
        failures,
      });
    }
  }

  async upsertDraft(
    userId: string,
    dto: UpsertDraftDto,
    draftVersion?: string,
  ): Promise<ProfileDraftResponseDto> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
      select: ['id'],
    });

    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }

    // Validate visible link items before saving
    if (dto.content?.links?.items?.length) {
      await this.validateLinkItems(dto.content.links.items);
    }

    // Validate CTA before saving to draft
    if (dto.content?.cta) {
      this.validateCtaContent(dto.content.cta);
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const draftRepo = manager.getRepository(ProfileDraft);
      await manager
        .getRepository(Profile)
        .createQueryBuilder('p')
        .where('p.id = :profileId', { profileId: profile.id })
        .setLock('pessimistic_write')
        .getOneOrFail();

      // Lock the existing draft row if it exists — prevents concurrent writes
      const existingDrafts = await draftRepo
        .createQueryBuilder('d')
        .where('d.profile_id = :profileId', { profileId: profile.id })
        .setLock('pessimistic_write')
        .getMany();

      const existingDraft = existingDrafts[0] ?? null;

      // Concurrency check — only if caller sent a token
      if (draftVersion && existingDraft) {
        if (existingDraft.updatedAt.toISOString() !== draftVersion) {
          throw new ConflictException(
            'Draft was modified by another session. ' +
              'Re-fetch (GET /profiles/content) and retry.',
          );
        }
      }

      const draft = draftRepo.create({
        ...(existingDraft ? { id: existingDraft.id } : {}),
        profileId: profile.id,
        bio: dto.bio !== undefined ? dto.bio : (existingDraft?.bio ?? null),
        photoUrl:
          dto.photoUrl !== undefined
            ? dto.photoUrl
            : (existingDraft?.photoUrl ?? null),
        content:
          dto.content !== undefined
            ? dto.content
            : (existingDraft?.content ?? null),
        themeSettings:
          dto.themeSettings !== undefined
            ? dto.themeSettings
            : (existingDraft?.themeSettings ?? null),

        appearance:
          dto.appearance !== undefined
            ? dto.appearance
            : (existingDraft?.appearance ?? null),
      });

      return draftRepo.save(draft);
    });

    return {
      profileId: profile.id,
      bio: saved.bio,
      photoUrl: saved.photoUrl,
      content: saved.content,
      themeSettings: saved.themeSettings,
      appearance: saved.appearance,
      source: 'draft',
      updatedAt: saved.updatedAt,
    };
  }

  async getDraftState(userId: string): Promise<{
    status: string;
    hasDraft: boolean;
    draftId?: string;
    updatedAt?: Date;
  }> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
      select: ['id'],
    });
    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }

    const draft = await this.profileDraftRepo.findOne({
      where: { profileId: profile.id },
      select: ['id', 'updatedAt'],
    });

    if (!draft) {
      return { status: 'success', hasDraft: false };
    }

    return {
      status: 'success',
      hasDraft: true,
      draftId: draft.id,
      updatedAt: draft.updatedAt,
    };
  }

  async updateAppearance(
    userId: string,
    dto: AppearanceSettingsDto,
  ): Promise<{ status: string; appearance: AppearanceSettingsDto }> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });
    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }

    const merged = await this.dataSource.transaction(async (manager) => {
      const txProfileRepo = manager.getRepository(Profile);
      const txDraftRepo = manager.getRepository(ProfileDraft);

      const lockedProfile = await txProfileRepo
        .createQueryBuilder('p')
        .where('p.id = :profileId', { profileId: profile.id })
        .setLock('pessimistic_write')
        .getOneOrFail();

      const existingDraft = await txDraftRepo
        .createQueryBuilder('d')
        .where('d.profile_id = :profileId', { profileId: profile.id })
        .setLock('pessimistic_write')
        .getOne();

      const existingAppearance =
        existingDraft?.appearance ?? lockedProfile.appearance ?? {};

      const mergedAppearance: AppearanceSettingsDto = {
        global: {
          ...(existingAppearance.global ?? {}),
          ...(dto.global ?? {}),
        },
        components: {
          bio: {
            ...(existingAppearance.components?.bio ?? {}),
            ...(dto.components?.bio ?? {}),
          },
          links: {
            ...(existingAppearance.components?.links ?? {}),
            ...(dto.components?.links ?? {}),
          },
          projects: {
            ...(existingAppearance.components?.projects ?? {}),
            ...(dto.components?.projects ?? {}),
          },
          cta: {
            ...(existingAppearance.components?.cta ?? {}),
            ...(dto.components?.cta ?? {}),
          },
        },
      };

      await txDraftRepo.save({
        ...(existingDraft ? { id: existingDraft.id } : {}),
        profileId: lockedProfile.id,
        appearance: mergedAppearance,
      });

      if (dto.global?.template)
        lockedProfile.templateType = dto.global.template;
      lockedProfile.hasUnpublishedChanges = true;
      await txProfileRepo.save(lockedProfile);

      return mergedAppearance;
    });

    return { status: 'success', appearance: merged };
  }

  async getAppearance(userId: string): Promise<{
    status: string;
    appearance: AppearanceSettingsDto;
  }> {
    const profile = await this.profileRepo.findOne({
      where: {
        userId,
        deletedAt: IsNull(),
      },
    });

    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete onboarding first.',
      );
    }

    const VALID_FONTS = new Set([
      'afacad',
      'inter',
      'serif',
      'mono',
      'geologica',
      'manrope',
    ]);

    const saved = profile.appearance ?? {};
    const appearance: AppearanceSettingsDto = {
      global: {
        ...DEFAULT_APPEARANCE.global,
        ...(saved.global ?? {}),
      },
      components: {
        bio: {
          ...DEFAULT_APPEARANCE.components!.bio,
          ...(saved.components?.bio ?? {}),
        },
        links: {
          ...DEFAULT_APPEARANCE.components!.links,
          ...(saved.components?.links ?? {}),
        },
        projects: {
          ...DEFAULT_APPEARANCE.components!.projects,
          ...(saved.components?.projects ?? {}),
        },
        cta: {
          ...DEFAULT_APPEARANCE.components!.cta,
          ...(saved.components?.cta ?? {}),
        },
        workExperience: {
          ...DEFAULT_APPEARANCE.components!.workExperience,
          ...(saved.components?.workExperience ?? {}),
        },
        education: {
          ...DEFAULT_APPEARANCE.components!.education,
          ...(saved.components?.education ?? {}),
        },
        skills: {
          ...DEFAULT_APPEARANCE.components!.skills,
          ...(saved.components?.skills ?? {}),
        },
        awards: {
          ...DEFAULT_APPEARANCE.components!.awards,
          ...(saved.components?.awards ?? {}),
        },
      },
    };

    if (!appearance.global!.font || !VALID_FONTS.has(appearance.global!.font)) {
      appearance.global!.font = DEFAULT_APPEARANCE.global!.font;
    }

    return {
      status: 'success',
      appearance,
    };
  }
}
