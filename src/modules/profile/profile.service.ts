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
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository, DataSource, In } from 'typeorm';
import * as crypto from 'crypto';
import { RedisService } from '../../common/redis/redis.service';
import { Profile } from './entities/profile.entity';
import { ProfileComponent } from './entities/profile-component.entity';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UsernamesService } from '../usernames/usernames.service';
import { PublishProfileDto } from './dto/publish-profile.dto';
import { ProfileContentDto } from './dto/profile-content.dto';

const CACHE_TTL_SECONDS = 60;
const MAX_COMPONENTS = 50;
const CACHE_404_TTL_SECONDS = 30;

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,
    @InjectRepository(ProfileComponent)
    private readonly componentRepo: Repository<ProfileComponent>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
    private readonly usernamesService: UsernamesService,
  ) {}

  async createProfile(
    createProfileDto: CreateProfileDto,
    user: AuthenticatedUser,
  ): Promise<Profile> {
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
      throw new UnprocessableEntityException(
        'Username must be 3-30 characters, use only letters, numbers, and hyphens, ' +
          'and must not start, end, or contain consecutive hyphens.',
      );
    }

    // Step 3 - fetch user record to get fullName stored at registration
    const dbUser = await this.userRepo.findOne({
      where: { id: user.sub },
      select: ['fullName'],
    });

    if (!dbUser) {
      throw new NotFoundException('User not found');
    }

    // Step 4 - create and save the profile
    const profile = this.profileRepo.create({
      userId: user.sub,
      username: usernameCheck.normalizedUsername, // already trimmed + lowercased by UsernamesService
      fullName: createProfileDto.fullName,
      bio: createProfileDto.bio,
      photoUrl: createProfileDto.photoUrl,
      isPublished: createProfileDto.isPublished ?? true,
    });

    // Step 5 - persist profile + flip onboarding flag atomically.
    // If either write fails the transaction rolls back, leaving the user
    // in a clean state where they can retry without hitting a conflict.
    const savedProfile = await this.dataSource.transaction(async (manager) => {
      const txProfileRepo = manager.getRepository(Profile);
      const txUserRepo = manager.getRepository(User);

      const saved = await txProfileRepo.save(profile);

      const updateResult = await txUserRepo.update(
        { id: user.sub },
        { onboardingComplete: true },
      );

      if (updateResult.affected !== 1) {
        throw new NotFoundException('User not found');
      }

      return saved;
    });

    return savedProfile;
  }

  async getPublicProfile(username: string): Promise<{
    data: Record<string, unknown>;
    etag: string;
    fromCache: boolean;
  }> {
    const normalizedUsername = username.toLowerCase();
    const cacheKey = `profile:${normalizedUsername}`;
    const lockKey = `profile:lock:${normalizedUsername}`;

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as Record<string, unknown>;
      if (parsed['__notFound']) {
        throw new NotFoundException({ error: 'not_found' });
      }
      const etag = this.computeEtag(cached);
      return { data: parsed, etag, fromCache: true };
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
        throw new NotFoundException({ error: 'not_found' });
      }

      const components = await this.componentRepo.find({
        where: { profileId: profile.id, isEnabled: true },
        order: { displayOrder: 'ASC' },
        take: MAX_COMPONENTS,
      });

      const activeComponents = components.filter(
        (c) => c.metadata && Object.keys(c.metadata).length > 0,
      );

      const responseData = this.serialize(profile, activeComponents);
      const serialized = JSON.stringify(responseData);

      this.logger.log(`Cache miss for profile: ${normalizedUsername}`);
      await this.redisService.set(cacheKey, serialized, CACHE_TTL_SECONDS);
      const etag = this.computeEtag(serialized);

      return { data: responseData, etag, fromCache: false };
    } finally {
      if (lockAcquired) {
        await this.redisService.del(lockKey);
      }
    }
  }

  async getDashboardProfile(userId: string): Promise<Record<string, unknown>> {
    const profile = await this.profileRepo.findOne({
      where: { userId, deletedAt: IsNull() },
    });

    if (!profile) {
      throw new NotFoundException(
        'Profile not found. Please complete your profile setup.',
      );
    }

    const components = await this.componentRepo.find({
      where: { profileId: profile.id },
      order: { displayOrder: 'ASC' },
    });

    return {
      username: profile.username,
      fullName: profile.fullName,
      bio: profile.bio,
      photoUrl: profile.photoUrl,
      templateType: profile.templateType,
      themeSettings: profile.themeSettings,
      isPublished: profile.isPublished,
      hasUnpublishedChanges: profile.hasUnpublishedChanges,
      ctaLabel: profile.ctaLabel ?? null,
      ctaUrl: profile.ctaUrl ?? null,
      components: components.map((c) => ({
        id: c.id,
        sectionType: c.sectionType,
        title: c.title,
        content: c.content,
        displayOrder: c.displayOrder,
        isEnabled: c.isEnabled,
        metadata: c.metadata,
      })),
    };
  }

  async invalidateCache(username: string): Promise<void> {
    await this.redisService.del(`profile:${username.toLowerCase()}`);
  }

  private serialize(
    profile: Profile,
    components: ProfileComponent[],
  ): Record<string, unknown> {
    return {
      username: profile.username,
      fullName: profile.fullName ?? null,
      bio: profile.bio,
      photoUrl: profile.photoUrl,
      templateType: profile.templateType,
      themeSettings: profile.themeSettings,
      components: components.map((c) => ({
        sectionType: c.sectionType,
        title: c.title,
        content: c.content,
        displayOrder: c.displayOrder,
        metadata: c.metadata,
      })),
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

  async updateProfile(
    username: string,
    dto: UpdateProfileDto,
    userId: string,
  ): Promise<Record<string, unknown>> {
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

    return {
      username: saved.username,
      fullName: saved.fullName,
      bio: saved.bio,
      photoUrl: saved.photoUrl,
      hasUnpublishedChanges: saved.hasUnpublishedChanges,
    };
  }

  async publishProfile(
    userId: string,
    dto: PublishProfileDto,
  ): Promise<Record<string, string>> {
    const { action } = dto;

    if (!action) {
      throw new UnprocessableEntityException({
        message: 'Please specify an action: publish or unpublish.',
      });
    }

    if (action !== 'publish' && action !== 'unpublish') {
      throw new UnprocessableEntityException({
        message: 'Action must be either publish or unpublish.',
      });
    }

    const profile = await this.profileRepo.findOne({
      where: {
        userId,
        deletedAt: IsNull(),
      },
    });

    if (!profile) {
      throw new NotFoundException({
        message: 'Complete your profile setup before publishing.',
      });
    }

    /**
     * PUBLISH
     */
    if (action === 'publish') {
      const missingRequirements = !profile.fullName || !profile.username;

      if (missingRequirements) {
        throw new BadRequestException({
          error: 'PUBLISH_REQUIREMENTS_NOT_MET',
          message:
            'Your profile needs a fullName and username before it can be published.',
        });
      }

      /**
       * Idempotent behavior:
       * already published => still return success
       */
      if (!profile.isPublished) {
        profile.isPublished = true;
      }
      profile.hasUnpublishedChanges = false;
      await this.profileRepo.save(profile);

      await this.invalidateCache(profile.username);

      return {
        status: 'success',
        message: 'Your profile is now live.',
        profileUrl: `openprofile.com/${profile.username}`,
      };
    }

    /**
     * UNPUBLISH
     */
    if (profile.isPublished) {
      profile.isPublished = false;
      await this.profileRepo.save(profile);
    }

    await this.invalidateCache(profile.username);

    return {
      status: 'success',
      message:
        'Your profile has been unpublished. It is no longer visible to the public.',
    };
  }

  async getProfileContent(userId: string): Promise<ProfileContentDto> {
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

    if (profile.content) {
      return profile.content;
    }

    /**
     * Temporary fallback hydration logic.
     *
     * NOTE:
     * This reconstructs the editable canvas document from
     * legacy profile/component fields until PATCH
     * /profiles/content is fully implemented.
     */
    const components = await this.componentRepo.find({
      where: {
        profileId: profile.id,
      },
      order: {
        displayOrder: 'ASC',
      },
    });

    const links = components.filter(
      (component) => component.sectionType === 'links',
    );

    const projects = components.filter(
      (component) => component.sectionType === 'projects',
    );

    const defaultSectionOrder: string[] = ['bio', 'links', 'projects', 'cta'];

    return {
      sectionOrder: defaultSectionOrder,

      bio: {
        visible: true,
        content: profile.bio ?? '',
      },

      links: {
        visible: true,
        sectionTitle: 'Links',
        items: links.map((link) => link.metadata ?? {}),
      },

      projects: {
        visible: true,
        sectionTitle: 'Projects',
        items: projects.map((project) => project.metadata ?? {}),
      },

      cta: {
        visible: true,
        label: profile.ctaLabel ?? '',
        url: profile.ctaUrl ?? null,
      },
    };
  }
}
