import { BadRequestException } from '@nestjs/common';
import { escapeLikePattern, UserSearchAction } from './user-search.action';

function buildQueryBuilder(rows: unknown[] = []) {
  const calls: Record<string, unknown[][]> = {};
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      (calls[name] ??= []).push(args);
      return qb;
    };
  const qb: Record<string, unknown> = {
    leftJoin: record('leftJoin'),
    where: record('where'),
    andWhere: record('andWhere'),
    select: record('select'),
    orderBy: record('orderBy'),
    addOrderBy: record('addOrderBy'),
    setParameter: record('setParameter'),
    limit: record('limit'),
    offset: record('offset'),
    clone: () => qb,
    getCount: jest.fn().mockResolvedValue(rows.length),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
  return { qb, calls };
}

describe('UserSearchAction', () => {
  function setup(rows: unknown[] = []) {
    const { qb, calls } = buildQueryBuilder(rows);
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const action = new UserSearchAction(repo as never);
    return { action, calls };
  }

  it('joins profiles, since usernames live there and not on users', async () => {
    const { action, calls } = setup();

    await action.searchUsers({ q: 'mike' });

    expect(calls.leftJoin[0]).toEqual([
      'profiles',
      'p',
      'p.user_id = u.id AND p.deleted_at IS NULL',
    ]);
  });

  it('matches profile username, profile name, account name and email', async () => {
    const { action, calls } = setup();

    await action.searchUsers({ q: 'mike' });

    const [clause, params] = calls.andWhere[0] as [string, { pattern: string }];
    expect(clause).toContain('p.username ILIKE :pattern');
    expect(clause).toContain('p.full_name ILIKE :pattern');
    expect(clause).toContain('u.full_name ILIKE :pattern');
    expect(clause).toContain('u.email ILIKE :pattern');
    expect(params.pattern).toBe('%mike%');
  });

  it('reads name, username, photo and published state from the profile', async () => {
    const { action, calls } = setup();

    await action.searchUsers({ q: 'mike' });

    const columns = (calls.select[0][0] as string[]).join('\n');
    expect(columns).toContain('COALESCE(p.full_name, u.full_name)');
    expect(columns).toMatch(/p\.username\s+AS "username"/);
    expect(columns).toMatch(/p\.photo_url\s+AS "photoUrl"/);
    expect(columns).toContain('COALESCE(p.is_published, false)');
    expect(columns).not.toMatch(/u\.username/);
  });

  it('treats % and _ in the query as literal characters', async () => {
    const { action, calls } = setup();

    await action.searchUsers({ q: '50%_off' });

    const [, params] = calls.andWhere[0] as [string, { pattern: string }];
    expect(params.pattern).toBe('%50\\%\\_off%');
  });

  it('rejects a query shorter than the minimum', async () => {
    const { action } = setup();

    await expect(action.searchUsers({ q: 'm' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns rows with paging metadata', async () => {
    const row = { id: 'u1', username: 'testmike' };
    const { action } = setup([row]);

    await expect(action.searchUsers({ q: 'mike' })).resolves.toEqual({
      results: [row],
      total: 1,
      page: 1,
      limit: expect.any(Number),
      totalPages: 1,
    });
  });
});

describe('escapeLikePattern', () => {
  it('escapes LIKE wildcards and the escape character itself', () => {
    expect(escapeLikePattern('plain')).toBe('plain');
    expect(escapeLikePattern('a%b_c')).toBe('a\\%b\\_c');
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });
});
