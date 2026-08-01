import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { Profile } from '../../profile/entities/profile.entity';
import { PaginatedSearchResult, SearchAction } from './search.action';

function createQueryBuilderMock() {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
    clone: jest.fn(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };

  qb.clone.mockReturnValue(qb);
  return qb;
}

describe('SearchAction', () => {
  let action: SearchAction;
  let repo: jest.Mocked<Pick<Repository<Profile>, 'createQueryBuilder'>>;
  let qb: ReturnType<typeof createQueryBuilderMock>;

  beforeEach(async () => {
    qb = createQueryBuilderMock();
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchAction,
        { provide: getRepositoryToken(Profile), useValue: repo },
      ],
    }).compile();

    action = module.get(SearchAction);
  });

  it('throws BadRequestException when the query is shorter than three characters', async () => {
    await expect(action.searchProfiles({ q: 'ad' })).rejects.toThrow(
      BadRequestException,
    );

    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('throws BadRequestException for a whitespace-only query', async () => {
    await expect(action.searchProfiles({ q: '   ' })).rejects.toThrow(
      BadRequestException,
    );

    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('searches published, active profiles and returns pagination metadata', async () => {
    const rows: PaginatedSearchResult['results'] = [
      {
        id: '1',
        username: 'ada',
        fullName: 'Ada Lovelace',
        bio: 'Mathematician',
        photoUrl: null,
      },
    ];
    qb.getCount.mockResolvedValue(11);
    qb.getRawMany.mockResolvedValue(rows);

    const result = await action.searchProfiles({
      q: 'ada',
      page: 2,
      limit: 4,
    });

    expect(repo.createQueryBuilder).toHaveBeenCalledWith('p');
    expect(qb.where).toHaveBeenCalledWith('p.is_published = true');
    expect(qb.andWhere).toHaveBeenCalledWith('p.deleted_at IS NULL');
    expect(qb.andWhere).toHaveBeenCalledWith('p.is_public = true');
    expect(qb.setParameter).toHaveBeenCalledWith('q', 'ada');
    expect(qb.limit).toHaveBeenCalledWith(4);
    expect(qb.offset).toHaveBeenCalledWith(4);
    expect(qb.getCount).toHaveBeenCalled();
    expect(qb.getRawMany).toHaveBeenCalled();
    expect(result).toEqual({
      results: rows,
      total: 11,
      page: 2,
      limit: 4,
      totalPages: 3,
    });
  });

  it('caps the requested limit at the maximum of 20', async () => {
    qb.getCount.mockResolvedValue(41);
    qb.getRawMany.mockResolvedValue([]);

    const result = await action.searchProfiles({
      q: 'react',
      page: 3,
      limit: 100,
    });

    expect(qb.limit).toHaveBeenCalledWith(20);
    expect(qb.offset).toHaveBeenCalledWith(40);
    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(3);
  });

  it('uses the default page and limit when they are omitted', async () => {
    qb.getCount.mockResolvedValue(0);
    qb.getRawMany.mockResolvedValue([]);

    const result = await action.searchProfiles({ q: 'node' });

    expect(qb.limit).toHaveBeenCalledWith(5);
    expect(qb.offset).toHaveBeenCalledWith(0);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(5);
  });

  it.each([
    { page: 0, limit: 5, expectedPage: 1, expectedLimit: 5 },
    { page: 1, limit: 0, expectedPage: 1, expectedLimit: 1 },
    { page: 1, limit: -1, expectedPage: 1, expectedLimit: 1 },
  ])(
    'clamps non-positive pagination values: page=$page limit=$limit',
    async ({ page, limit, expectedPage, expectedLimit }) => {
      qb.getCount.mockResolvedValue(0);
      qb.getRawMany.mockResolvedValue([]);

      const result = await action.searchProfiles({
        q: 'node',
        page,
        limit,
      });

      expect(repo.createQueryBuilder).toHaveBeenCalledWith('p');
      expect(qb.limit).toHaveBeenCalledWith(expectedLimit);
      expect(qb.offset).toHaveBeenCalledWith(0);
      expect(result.page).toBe(expectedPage);
      expect(result.limit).toBe(expectedLimit);
    },
  );
});
