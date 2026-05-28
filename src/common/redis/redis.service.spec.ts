jest.mock('../../config/env', () => ({
  env: {},
}));

import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let client: {
    scan: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(() => {
    service = new RedisService();
    client = {
      scan: jest.fn(),
      del: jest.fn(),
    };

    (
      service as unknown as {
        client: typeof client;
      }
    ).client = client;
  });

  it('deletes all keys matching a pattern across scan pages', async () => {
    client.scan
      .mockResolvedValueOnce(['12', ['search:ada:page=1:limit=5']])
      .mockResolvedValueOnce([
        '0',
        ['search:ada:page=2:limit=5', 'search:ada:page=1:limit=10'],
      ]);

    await service.delByPattern('search:ada:*');

    expect(client.scan).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      'search:ada:*',
      'COUNT',
      100,
    );
    expect(client.scan).toHaveBeenNthCalledWith(
      2,
      '12',
      'MATCH',
      'search:ada:*',
      'COUNT',
      100,
    );
    expect(client.del).toHaveBeenNthCalledWith(1, 'search:ada:page=1:limit=5');
    expect(client.del).toHaveBeenNthCalledWith(
      2,
      'search:ada:page=2:limit=5',
      'search:ada:page=1:limit=10',
    );
  });

  it('does not call del when no keys match the pattern', async () => {
    client.scan.mockResolvedValueOnce(['0', []]);

    await service.delByPattern('search:missing:*');

    expect(client.del).not.toHaveBeenCalled();
  });
});
