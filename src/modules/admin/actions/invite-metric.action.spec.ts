import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Invite } from '../../invites/entities/invite.entity';
import { InviteMetricAction } from './invite-metric.action';

describe('InviteMetricAction', () => {
  let action: InviteMetricAction;
  let repo: {
    query: jest.Mock;
  };

  beforeEach(async () => {
    repo = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InviteMetricAction,
        { provide: getRepositoryToken(Invite), useValue: repo },
      ],
    }).compile();

    action = module.get(InviteMetricAction);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('conversionInWindow', () => {
    it('returns sent and claimed counts for the given window', async () => {
      const start = new Date('2026-08-17T00:00:00.000Z');
      const end = new Date('2026-08-24T00:00:00.000Z');
      const row = { sent: '12', claimed: '5' };
      repo.query.mockResolvedValue([row]);

      await expect(action.conversionInWindow(start, end)).resolves.toEqual(row);
      expect(repo.query).toHaveBeenCalledTimes(1);

      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('SELECT');
      expect(sql).toContain('COUNT(*) FILTER');
      expect(sql).toContain('FROM invites');
      expect(sql).toContain('"createdAt" >= $1');
      expect(sql).toContain('"claimedAt" >= $1');
      expect(params).toEqual([start, end]);
    });
  });
});
