import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsernamesService } from '../src/modules/usernames/usernames.service';
import { Profile } from '../src/modules/profile/entities/profile.entity';

const mockProfileRepository = {
  findOne: jest.fn(),
};

describe('UsernamesService', () => {
  let service: UsernamesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsernamesService,
        {
          provide: getRepositoryToken(Profile),
          useValue: mockProfileRepository,
        },
      ],
    }).compile();

    service = module.get<UsernamesService>(UsernamesService);
    mockProfileRepository.findOne.mockReset();
  });

  describe('normalization', () => {
    it('trims and lowercases before checking', async () => {
      mockProfileRepository.findOne.mockResolvedValue(null);
      const result = await service.check('  John-Doe  ');
      expect(result).toMatchObject({
        available: true,
        normalizedUsername: 'john-doe',
      });
    });
  });

  describe('format validation', () => {
    const invalid = [
      'ab',
      'a'.repeat(31),
      '-starts',
      'ends-',
      'con--secutive',
      'has space',
      'has_underscore',
      'Ωmega',
    ];

    it.each(invalid)('rejects "%s" as INVALID_FORMAT', async (username) => {
      const result = await service.check(username);
      expect(result).toEqual({ available: false, reason: 'INVALID_FORMAT' });
    });

    it('accepts valid usernames', async () => {
      mockProfileRepository.findOne.mockResolvedValue(null);
      const result = await service.check('valid-user123');
      expect(result).toMatchObject({ available: true });
    });
  });

  describe('reserved keywords', () => {
    it('returns INVALID_FORMAT for reserved names (not RESERVED, per RFC §5)', async () => {
      const result = await service.check('admin');
      expect(result).toEqual({ available: false, reason: 'INVALID_FORMAT' });
      expect(mockProfileRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('database check', () => {
    it('returns TAKEN when username exists in DB', async () => {
      mockProfileRepository.findOne.mockResolvedValue({
        id: '1',
        username: 'taken-user',
      });
      const result = await service.check('taken-user');
      expect(result).toEqual({ available: false, reason: 'TAKEN' });
    });

    it('returns available when username is free', async () => {
      mockProfileRepository.findOne.mockResolvedValue(null);
      const result = await service.check('free-user');
      expect(result).toMatchObject({
        available: true,
        normalizedUsername: 'free-user',
      });
    });
  });
});
