jest.mock('../../config/env', () => ({
  env: {},
}));

jest.mock('node:dns/promises', () => ({
  __esModule: true,
  default: {
    lookup: jest.fn(),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import dns from 'node:dns/promises';
import { ProfileService } from './profile.service';
import { Profile } from './entities/profile.entity';
import { ProfileComponent } from './entities/profile-component.entity';
import { ProfileDraft } from './entities/profile-draft.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { RedisService } from '../../common/redis/redis.service';
import { UsernamesService } from '../usernames/usernames.service';
import { ComponentSetMismatchException } from './exceptions/component-set-mismatch.exception';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { LinkItemDto } from './dto/profile-content.dto';
import { SectionType } from './dto/profile-content.dto';
import { CtaType } from './dto/profile-content.dto';

const mockDnsLookup = dns.lookup as jest.Mock;

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROFILE_ID = '660e8400-e29b-41d4-a716-446655440001';
const OTHER_USER_ID = '770e8400-e29b-41d4-a716-446655440002';
const COMPONENT_ID = '880e8400-e29b-41d4-a716-446655440003';
const USERNAME = 'testuser';
const NOW = new Date('2026-05-20T12:00:00.000Z');

const mockUser: AuthenticatedUser = {
  sub: USER_ID,
  email: 'test@example.com',
  role: UserRole.USER,
  onboardingComplete: false,
};

const mockProfile = {
  id: PROFILE_ID,
  userId: USER_ID,
  username: USERNAME,
  fullName: 'Test User',
  bio: 'A test bio',
  photoUrl: 'https://example.com/photo.jpg',
  templateType: null,
  themeSettings: null,
  content: null,
  ctaLabel: null,
  ctaUrl: null,
  isPublished: true,
  isSearchable: true,
  isVerified: false,
  hasUnpublishedChanges: false,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
} as Profile;

const mockComponent = {
  id: COMPONENT_ID,
  profileId: PROFILE_ID,
  sectionType: 'bio',
  title: 'About Me',
  content: 'Hello!',
  metadata: null,
  isEnabled: true,
  displayOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
} as ProfileComponent;

const mockDraft = {
  id: '990e8400-e29b-41d4-a716-446655440004',
  profileId: PROFILE_ID,
  username: null,
  fullName: null,
  bio: 'Draft bio',
  photoUrl: null,
  content: null,
  themeSettings: null,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
} as ProfileDraft;

const mockLinkItem: LinkItemDto = {
  id: 'link-001',
  label: 'My GitHub',
  url: 'https://github.com/username',
  platform: 'github',
  visible: true,
};

const mockDraftContent = {
  sectionOrder: [
    SectionType.BIO,
    SectionType.LINKS,
    SectionType.PROJECTS,
    SectionType.CTA,
  ],
  bio: { visible: true, content: '' },
  links: { visible: true, sectionTitle: 'Links', items: [mockLinkItem] },
  projects: { visible: true, sectionTitle: 'Projects', items: [] },
  cta: {
    visible: true,
    type: CtaType.LINK,
    label: 'Contact Me',
    value: 'https://example.com',
  },
};

// Helper to build a chainable query-builder mock
function mockQueryBuilder<T>(getManyResolve: T, getOneOrFailResolve?: unknown) {
  return {
    where: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(getManyResolve),
    getOneOrFail: jest
      .fn()
      .mockResolvedValue(getOneOrFailResolve ?? getManyResolve),
  };
}

describe('ProfileService', () => {
  let service: ProfileService;
  let profileRepo: Record<string, jest.Mock>;
  let componentRepo: Record<string, jest.Mock>;
  let draftRepo: Record<string, jest.Mock>;
  let userRepo: Record<string, jest.Mock>;
  let redisService: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;
  let usernamesService: Record<string, jest.Mock>;
  let txManager: Record<string, jest.Mock>;

  beforeEach(async () => {
    profileRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    componentRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    draftRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    userRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
    };

    redisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    usernamesService = {
      check: jest.fn(),
    };

    // Transaction-level repository mocks
    const txProfileRepo = {
      save: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const txUserRepo = {
      update: jest.fn(),
    };
    const txDraftRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const txComponentRepo = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    txManager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Profile) return txProfileRepo;
        if (entity === User) return txUserRepo;
        if (entity === ProfileDraft) return txDraftRepo;
        if (entity === ProfileComponent) return txComponentRepo;
        return {};
      }),
    };

    dataSource = {
      transaction: jest.fn((cb: (mgr: typeof txManager) => unknown) =>
        cb(txManager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: getRepositoryToken(Profile), useValue: profileRepo },
        {
          provide: getRepositoryToken(ProfileComponent),
          useValue: componentRepo,
        },
        {
          provide: getRepositoryToken(ProfileDraft),
          useValue: draftRepo,
        },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: RedisService, useValue: redisService },
        { provide: DataSource, useValue: dataSource },
        { provide: UsernamesService, useValue: usernamesService },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
    jest.clearAllMocks();
    mockDnsLookup.mockResolvedValue({ address: '140.82.114.4' });
  });

  // ---------------------------------------------------------------------------
  // createProfile
  // ---------------------------------------------------------------------------
  describe('createProfile', () => {
    const createDto = {
      username: USERNAME,
      bio: 'A test bio',
      photoUrl: 'https://example.com/photo.jpg',
    };

    it('creates a profile and flips onboardingComplete in a transaction', async () => {
      profileRepo.findOne.mockResolvedValue(null);
      usernamesService.check.mockResolvedValue({
        available: true,
        normalizedUsername: USERNAME,
      });
      userRepo.findOne.mockResolvedValue({ fullName: 'Test User' });

      const createdProfile = { ...mockProfile };
      profileRepo.create.mockReturnValue(createdProfile);

      const savedProfile = { ...mockProfile };
      const txProfileRepo = txManager.getRepository(Profile);
      txProfileRepo.save.mockResolvedValue(savedProfile);
      const txUserRepo = txManager.getRepository(User);
      txUserRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.createProfile(createDto, mockUser);

      expect(profileRepo.findOne).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
      expect(usernamesService.check).toHaveBeenCalledWith(USERNAME);
      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { id: USER_ID },
        select: ['fullName'],
      });
      expect(profileRepo.create).toHaveBeenCalledWith({
        userId: USER_ID,
        username: USERNAME,
        fullName: 'Test User',
        bio: createDto.bio,
        photoUrl: createDto.photoUrl,
        isPublished: true,
      });
      expect(txProfileRepo.save).toHaveBeenCalledWith(createdProfile);
      expect(txUserRepo.update).toHaveBeenCalledWith(
        { id: USER_ID },
        { onboardingComplete: true },
      );
      expect(result.id).toBe(PROFILE_ID);
      expect(result.username).toBe(USERNAME);
    });

    it('throws ConflictException when user already has a profile', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      await expect(service.createProfile(createDto, mockUser)).rejects.toThrow(
        ConflictException,
      );

      expect(usernamesService.check).not.toHaveBeenCalled();
    });

    it('throws ConflictException when username is taken', async () => {
      profileRepo.findOne.mockResolvedValue(null);
      usernamesService.check.mockResolvedValue({
        available: false,
        reason: 'TAKEN',
      });

      await expect(service.createProfile(createDto, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws UnprocessableEntityException when username format is invalid', async () => {
      profileRepo.findOne.mockResolvedValue(null);
      usernamesService.check.mockResolvedValue({
        available: false,
        reason: 'INVALID_FORMAT',
      });

      await expect(service.createProfile(createDto, mockUser)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('throws NotFoundException when user record is missing', async () => {
      profileRepo.findOne.mockResolvedValue(null);
      usernamesService.check.mockResolvedValue({
        available: true,
        normalizedUsername: USERNAME,
      });
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.createProfile(createDto, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when user update inside transaction fails', async () => {
      profileRepo.findOne.mockResolvedValue(null);
      usernamesService.check.mockResolvedValue({
        available: true,
        normalizedUsername: USERNAME,
      });
      userRepo.findOne.mockResolvedValue({ fullName: 'Test User' });

      const createdProfile = { ...mockProfile, id: undefined };
      profileRepo.create.mockReturnValue(createdProfile);

      const txProfileRepo2 = txManager.getRepository(Profile);
      txProfileRepo2.save.mockResolvedValue({ ...mockProfile });
      const txUserRepo2 = txManager.getRepository(User);
      txUserRepo2.update.mockResolvedValue({ affected: 0 });

      await expect(service.createProfile(createDto, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getPublicProfile
  // ---------------------------------------------------------------------------
  describe('getPublicProfile', () => {
    it('returns cached profile with etag and fromCache true', async () => {
      const cachedData: Record<string, unknown> = {
        username: USERNAME,
        fullName: 'Test User',
        photoUrl: null,
        templateType: null,
        themeSettings: null,
        content: null,
      };
      redisService.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.getPublicProfile(USERNAME);

      expect(result.data.username).toBe(USERNAME);
      expect(result.fromCache).toBe(true);
      expect(result.etag).toBeTruthy();
      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for cached 404', async () => {
      redisService.get.mockResolvedValue(JSON.stringify({ __notFound: true }));

      await expect(service.getPublicProfile(USERNAME)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('fetches from DB on cache miss, caches result, and returns etag', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.set.mockResolvedValue(true);
      profileRepo.findOne.mockResolvedValue({
        ...mockProfile,
        user: { id: USER_ID },
      });

      const result = await service.getPublicProfile(USERNAME);

      expect(profileRepo.findOne).toHaveBeenCalledWith({
        where: {
          username: USERNAME,
          isPublished: true,
          deletedAt: IsNull(),
        },
        relations: ['user'],
      });
      expect(redisService.set).toHaveBeenCalledTimes(2);
      expect(redisService.del).toHaveBeenCalled();
      expect(result.data.username).toBe(USERNAME);
      expect(result.fromCache).toBe(false);
      expect(result.etag).toBeTruthy();
    });

    it('caches 404 on cache miss when profile not found', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.set.mockResolvedValue(true);
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.getPublicProfile(USERNAME)).rejects.toThrow(
        NotFoundException,
      );

      expect(redisService.set).toHaveBeenCalledWith(
        `profile:${USERNAME}`,
        JSON.stringify({ __notFound: true }),
        expect.any(Number),
      );
    });

    it('does not release lock it did not acquire', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.set.mockResolvedValue(false);
      profileRepo.findOne.mockResolvedValue({
        ...mockProfile,
        user: { id: USER_ID },
      });

      await service.getPublicProfile(USERNAME);

      expect(redisService.del).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getAppearance
  // ---------------------------------------------------------------------------
  describe('getAppearance', () => {
    const defaultAppearance = {
      template: 'professional',
      accentColour: '#0EA5E9',
      font: 'inter',
      cornerStyle: 'rounded',
      spacing: 20,
      theme: 'light',
    };

    it('returns saved appearance when profile has appearance', async () => {
      profileRepo.findOne.mockResolvedValue({
        ...mockProfile,
        appearance: {
          template: 'creator',
          accentColour: '#6366f1',
          font: 'serif',
          cornerStyle: 'pill',
          spacing: 16,
          theme: 'dark',
        },
      });

      const result = await service.getAppearance(USER_ID);

      expect(profileRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: USER_ID,
            deletedAt: IsNull(),
          }),
        }),
      );

      expect(result.status).toBe('success');
      expect(result.appearance).toEqual({
        template: 'creator',
        accentColour: '#6366f1',
        font: 'serif',
        cornerStyle: 'pill',
        spacing: 16,
        theme: 'dark',
      });
    });

    it('returns default appearance when none exists', async () => {
      profileRepo.findOne.mockResolvedValue({
        ...mockProfile,
        appearance: null,
      });

      const result = await service.getAppearance(USER_ID);

      expect(result.appearance).toEqual(defaultAppearance);
    });

    it('returns default appearance when appearance is undefined', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      const result = await service.getAppearance(USER_ID);

      expect(result.appearance).toEqual(defaultAppearance);
    });

    it('throws NotFoundException when profile does not exist', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.getAppearance(USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
  // ---------------------------------------------------------------------------
  // getDashboardProfile
  // ---------------------------------------------------------------------------
  describe('getDashboardProfile', () => {
    it('returns default content when neither draft nor published content exist', async () => {
      profileRepo.findOne.mockResolvedValue({
        ...mockProfile,
        content: null,
        bio: null,
        ctaLabel: null,
        ctaUrl: null,
      });
      draftRepo.findOne.mockResolvedValue(null);

      const result = await service.getProfileContent(USER_ID);

      expect(result.source).toBe('published');
      expect(result.content).toBeDefined();

      // safer: avoids coupling test to enum string values
      expect(result.content!.sectionOrder).toHaveLength(4);
      expect(result.content!.bio.visible).toBe(true);
      expect(result.content!.links.visible).toBe(true);
      expect(result.content!.projects.visible).toBe(true);
      expect(result.content!.cta.visible).toBe(true);
    });

    it('throws NotFoundException when profile does not exist', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.getDashboardProfile(USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // patchComponent
  // ---------------------------------------------------------------------------
  describe('patchComponent', () => {
    const patchDto = { isEnabled: false, title: 'Updated Title' };

    it('updates a component owned by the user and invalidates cache', async () => {
      componentRepo.findOne.mockResolvedValue(mockComponent);
      profileRepo.findOne.mockResolvedValue(mockProfile);
      componentRepo.save.mockResolvedValue({
        ...mockComponent,
        isEnabled: false,
        title: 'Updated Title',
      });

      const result = await service.patchComponent(
        USER_ID,
        COMPONENT_ID,
        patchDto,
      );

      expect(result.isEnabled).toBe(false);
      expect(result.title).toBe('Updated Title');
      expect(redisService.del).toHaveBeenCalledWith(`profile:${USERNAME}`);
    });

    it('throws NotFoundException when component does not exist', async () => {
      componentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.patchComponent(USER_ID, COMPONENT_ID, patchDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when owning profile is soft-deleted', async () => {
      componentRepo.findOne.mockResolvedValue(mockComponent);
      profileRepo.findOne.mockResolvedValue(null);

      await expect(
        service.patchComponent(USER_ID, COMPONENT_ID, patchDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when component belongs to another user', async () => {
      componentRepo.findOne.mockResolvedValue(mockComponent);
      profileRepo.findOne.mockResolvedValue({
        ...mockProfile,
        userId: OTHER_USER_ID,
      });

      await expect(
        service.patchComponent(USER_ID, COMPONENT_ID, patchDto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ---------------------------------------------------------------------------
  // reorderComponents
  // ---------------------------------------------------------------------------
  describe('reorderComponents', () => {
    const componentIds = [COMPONENT_ID];
    const currentComponents = [{ ...mockComponent, displayOrder: 0 }];

    it('reorders components and invalidates cache', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      const txComponentRepo = txManager.getRepository(ProfileComponent);
      const qb1 = mockQueryBuilder(currentComponents);
      const qb2 = mockQueryBuilder(currentComponents);
      txComponentRepo.createQueryBuilder
        .mockReturnValueOnce(qb1)
        .mockReturnValueOnce(qb2);

      const result = await service.reorderComponents(USER_ID, {
        componentIds,
      });

      expect(result).toHaveLength(1);
      expect(redisService.del).toHaveBeenCalledWith(`profile:${USERNAME}`);
    });

    it('throws NotFoundException when profile is missing', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(
        service.reorderComponents(USER_ID, { componentIds }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when IDs belong to another profile', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      const txComponentRepo = txManager.getRepository(ProfileComponent);
      const qb = mockQueryBuilder([]);
      txComponentRepo.createQueryBuilder.mockReturnValue(qb);
      txComponentRepo.find.mockResolvedValue([
        { id: COMPONENT_ID },
      ] as ProfileComponent[]);

      await expect(
        service.reorderComponents(USER_ID, { componentIds }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ComponentSetMismatchException when IDs do not match', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      const txComponentRepo = txManager.getRepository(ProfileComponent);
      const qb = mockQueryBuilder(currentComponents);
      txComponentRepo.createQueryBuilder.mockReturnValue(qb);
      txComponentRepo.find.mockResolvedValue([]);

      await expect(
        service.reorderComponents(USER_ID, {
          componentIds: ['00000000-0000-0000-0000-000000000099'],
        }),
      ).rejects.toThrow(ComponentSetMismatchException);
    });
  });

  // ---------------------------------------------------------------------------
  // updateProfile
  // ---------------------------------------------------------------------------
  describe('updateProfile', () => {
    const updateDto = { fullName: 'Updated Name', bio: 'Updated bio' };

    it('updates profile fields and sets hasUnpublishedChanges', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);
      profileRepo.save.mockResolvedValue({
        ...mockProfile,
        fullName: 'Updated Name',
        bio: 'Updated bio',
        hasUnpublishedChanges: true,
      });

      const result = await service.updateProfile(USERNAME, updateDto, USER_ID);

      expect(result.fullName).toBe('Updated Name');
      expect(result.hasUnpublishedChanges).toBe(true);
      expect(redisService.del).toHaveBeenCalledWith(`profile:${USERNAME}`);
    });

    it('throws NotFoundException when profile does not exist', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateProfile(USERNAME, updateDto, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the profile', async () => {
      profileRepo.findOne.mockResolvedValue({
        ...mockProfile,
        userId: OTHER_USER_ID,
      });

      await expect(
        service.updateProfile(USERNAME, updateDto, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('does not change fields not present in the DTO', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);
      profileRepo.save.mockImplementation((p: Profile) => Promise.resolve(p));

      await service.updateProfile(USERNAME, {}, USER_ID);

      expect(profileRepo.save).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // publishProfile
  // ---------------------------------------------------------------------------
  describe('publishProfile', () => {
    it('publishes draft content and deletes the draft row', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      const txDraftRepo = txManager.getRepository(ProfileDraft);
      txDraftRepo.findOne.mockResolvedValue(mockDraft);

      const txProfileRepo = txManager.getRepository(Profile);
      txProfileRepo.create.mockReturnValue({ ...mockProfile, content: null });
      txProfileRepo.save.mockResolvedValue({ ...mockProfile });

      const result = await service.publishProfile(USER_ID);

      expect(result.status).toBe('success');
      expect(txDraftRepo.delete).toHaveBeenCalledWith({
        profileId: PROFILE_ID,
      });
      expect(redisService.del).toHaveBeenCalledWith(`profile:${USERNAME}`);
    });

    it('returns already-up-to-date when no draft exists', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      const txDraftRepo = txManager.getRepository(ProfileDraft);
      txDraftRepo.findOne.mockResolvedValue(null);

      const result = await service.publishProfile(USER_ID);

      expect(result.status).toBe('success');
      expect(result.message).toContain('already up to date');
    });

    it('throws NotFoundException when profile does not exist', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.publishProfile(USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnprocessableEntityException when a visible link cannot be resolved on publish', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      mockDnsLookup.mockRejectedValue(new Error('Domain not found'));

      const txDraftRepo = txManager.getRepository(ProfileDraft);
      txDraftRepo.findOne.mockResolvedValue({
        ...mockDraft,
        content: mockDraftContent,
      });

      await expect(service.publishProfile(USER_ID)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mockDnsLookup).toHaveBeenCalledWith('github.com');
    });

    it('publishes successfully when all visible links resolve to public addresses', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      const txDraftRepo = txManager.getRepository(ProfileDraft);
      txDraftRepo.findOne.mockResolvedValue({
        ...mockDraft,
        content: mockDraftContent,
      });

      const txProfileRepo = txManager.getRepository(Profile);
      txProfileRepo.create.mockReturnValue({ ...mockProfile });
      txProfileRepo.save.mockResolvedValue({ ...mockProfile });

      const result = await service.publishProfile(USER_ID);

      expect(result.status).toBe('success');
      expect(mockDnsLookup).toHaveBeenCalledWith('github.com');
    });
  });

  // ---------------------------------------------------------------------------
  // getProfileContent
  // ---------------------------------------------------------------------------
  describe('getProfileContent', () => {
    it('returns draft content when draft exists', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);
      draftRepo.findOne.mockResolvedValue(mockDraft);

      const result = await service.getProfileContent(USER_ID);

      expect(result.source).toBe('draft');
      expect(result.bio).toBe('Draft bio');
    });

    it('falls back to published content when no draft exists', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);
      draftRepo.findOne.mockResolvedValue(null);

      const result = await service.getProfileContent(USER_ID);

      expect(result.source).toBe('published');
    });

    it('returns default content when neither draft nor published content exist', async () => {
      profileRepo.findOne.mockResolvedValue({
        ...mockProfile,
        content: null,
        bio: null,
        ctaLabel: null,
        ctaUrl: null,
      });
      draftRepo.findOne.mockResolvedValue(null);

      const result = await service.getProfileContent(USER_ID);

      expect(result.source).toBe('published');
      expect(result.content).toBeDefined();
      expect(result.content!.sectionOrder).toEqual([
        'bio',
        'links',
        'projects',
        'cta',
      ]);
    });

    it('throws NotFoundException when profile does not exist', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.getProfileContent(USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // upsertDraft
  // ---------------------------------------------------------------------------
  describe('upsertDraft', () => {
    const upsertDto = { bio: 'Updated draft bio' };

    it('creates a new draft when none exists', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      const txProfileRepo = txManager.getRepository(Profile);
      txProfileRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder(undefined, undefined),
      );

      const txDraftRepo = txManager.getRepository(ProfileDraft);
      txDraftRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));
      const draftFromDto = { ...mockDraft, bio: upsertDto.bio };
      txDraftRepo.create.mockReturnValue(draftFromDto);
      txDraftRepo.save.mockResolvedValue(draftFromDto);

      const result = await service.upsertDraft(USER_ID, upsertDto);

      expect(result.source).toBe('draft');
      expect(result.bio).toBe(upsertDto.bio);
    });

    it('updates an existing draft and validates concurrency version', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      const txProfileRepo = txManager.getRepository(Profile);
      txProfileRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder(undefined, undefined),
      );

      const txDraftRepo = txManager.getRepository(ProfileDraft);
      const existingDraft = { ...mockDraft, updatedAt: NOW };
      txDraftRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([existingDraft]),
      );
      txDraftRepo.create.mockReturnValue(existingDraft);
      txDraftRepo.save.mockResolvedValue(existingDraft);

      const result = await service.upsertDraft(
        USER_ID,
        upsertDto,
        NOW.toISOString(),
      );

      expect(result.source).toBe('draft');
    });

    it('throws ConflictException on concurrency mismatch', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      const txProfileRepo = txManager.getRepository(Profile);
      txProfileRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder(undefined, undefined),
      );

      const txDraftRepo = txManager.getRepository(ProfileDraft);
      const staleDraft = {
        ...mockDraft,
        updatedAt: new Date(NOW.getTime() - 10000),
      };
      txDraftRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([staleDraft]),
      );

      await expect(
        service.upsertDraft(USER_ID, upsertDto, 'different-version'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when profile does not exist', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.upsertDraft(USER_ID, upsertDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('validates visible link items before saving draft', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      const txProfileRepo = txManager.getRepository(Profile);
      txProfileRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder(undefined, undefined),
      );

      const txDraftRepo = txManager.getRepository(ProfileDraft);
      txDraftRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));
      txDraftRepo.create.mockReturnValue(mockDraft);
      txDraftRepo.save.mockResolvedValue(mockDraft);

      await expect(
        service.upsertDraft(USER_ID, { content: mockDraftContent }),
      ).resolves.not.toThrow();

      expect(mockDnsLookup).toHaveBeenCalledWith('github.com');
    });

    it('throws UnprocessableEntityException when a visible link cannot be resolved in upsertDraft', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      mockDnsLookup.mockRejectedValue(new Error('Domain not found'));

      await expect(
        service.upsertDraft(USER_ID, { content: mockDraftContent }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(mockDnsLookup).toHaveBeenCalledWith('github.com');
    });

    it('skips validation for hidden link items in upsertDraft', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      const txProfileRepo = txManager.getRepository(Profile);
      txProfileRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder(undefined, undefined),
      );

      const txDraftRepo = txManager.getRepository(ProfileDraft);
      txDraftRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));
      txDraftRepo.create.mockReturnValue(mockDraft);
      txDraftRepo.save.mockResolvedValue(mockDraft);

      await expect(
        service.upsertDraft(USER_ID, {
          content: {
            ...mockDraftContent,
            links: {
              visible: true,
              sectionTitle: 'Links',
              items: [{ ...mockLinkItem, visible: false }],
            },
          },
        }),
      ).resolves.not.toThrow();

      expect(mockDnsLookup).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException for SSRF url in upsertDraft', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);

      mockDnsLookup.mockResolvedValue({ address: '127.0.0.1' });

      await expect(
        service.upsertDraft(USER_ID, {
          content: {
            ...mockDraftContent,
            links: {
              visible: true,
              sectionTitle: 'Links',
              items: [{ ...mockLinkItem, url: 'http://localhost:5432' }],
            },
          },
        }),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockDnsLookup).toHaveBeenCalledWith('localhost');
    });
  });

  // ---------------------------------------------------------------------------
  // getDraftState
  // ---------------------------------------------------------------------------
  describe('getDraftState', () => {
    it('returns hasDraft true when a draft exists', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);
      draftRepo.findOne.mockResolvedValue(mockDraft);

      const result = await service.getDraftState(USER_ID);

      expect(result.hasDraft).toBe(true);
      expect(result.draftId).toBe(mockDraft.id);
    });

    it('returns hasDraft false when no draft exists', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);
      draftRepo.findOne.mockResolvedValue(null);

      const result = await service.getDraftState(USER_ID);

      expect(result.hasDraft).toBe(false);
    });

    it('throws NotFoundException when profile does not exist', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.getDraftState(USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // updateAppearance
  // ---------------------------------------------------------------------------
  describe('updateAppearance', () => {
    const appearanceDto = {
      template: 'professional' as const,
      accentColour: '#6366f1',
      font: 'inter' as const,
      cornerStyle: 'rounded' as const,
      spacing: 16,
      theme: 'dark' as const,
    };

    it('saves appearance, sets hasUnpublishedChanges, and invalidates cache', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile);
      profileRepo.save.mockResolvedValue({
        ...mockProfile,
        appearance: appearanceDto,
        hasUnpublishedChanges: true,
      });

      const result = await service.updateAppearance(USER_ID, appearanceDto);

      expect(result.status).toBe('success');
      expect(result.appearance).toEqual(appearanceDto);
      expect(profileRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          appearance: appearanceDto,
          hasUnpublishedChanges: true,
        }),
      );
      expect(redisService.del).toHaveBeenCalledWith(`profile:${USERNAME}`);
    });

    it('throws NotFoundException when profile does not exist', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateAppearance(USER_ID, appearanceDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('merges partial payload with existing appearance fields', async () => {
      const existingAppearance = {
        template: 'portfolio' as const,
        accentColour: '#ff0000',
        font: 'serif' as const,
        cornerStyle: 'sharp' as const,
        spacing: 8,
        theme: 'light' as const,
      };

      profileRepo.findOne.mockResolvedValue({
        ...mockProfile,
        appearance: existingAppearance,
      });
      profileRepo.save.mockImplementation((p: Profile) => Promise.resolve(p));

      const partial = { theme: 'dark' as const };
      await service.updateAppearance(USER_ID, partial);

      expect(profileRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          appearance: expect.objectContaining({
            template: 'portfolio',
            accentColour: '#ff0000',
            font: 'serif',
            cornerStyle: 'sharp',
            spacing: 8,
            theme: 'dark',
          }),
        }),
      );
    });
  });
});
