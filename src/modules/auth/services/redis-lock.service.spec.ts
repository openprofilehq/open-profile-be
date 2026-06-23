jest.mock('../../../config/env', () => ({ env: {} }));

import { RedisLockService } from './redis-lock.service';
import type { RedisService } from '../../../common/redis/redis.service';

describe('RedisLockService', () => {
  let service: RedisLockService;
  let redisMock: Partial<Record<keyof RedisService, jest.Mock>> & {
    set: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(() => {
    redisMock = {
      set: jest.fn(),
      del: jest.fn(),
    };

    service = new RedisLockService(redisMock as unknown as RedisService);
  });

  it('acquireLock returns true when redis.set returns true', async () => {
    redisMock.set.mockResolvedValue(true);

    const result = await service.acquireLock('token123');

    expect(result).toBe(true);
    expect(redisMock.set).toHaveBeenCalledWith(
      'lock:refresh:token123',
      '1',
      expect.any(Number),
      true,
    );
  });

  it('acquireLock returns false when redis.set returns false', async () => {
    redisMock.set.mockResolvedValue(false);

    const result = await service.acquireLock('token456');

    expect(result).toBe(false);
    expect(redisMock.set).toHaveBeenCalledWith(
      'lock:refresh:token456',
      '1',
      expect.any(Number),
      true,
    );
  });

  it('acquireLock returns true (fail open) when redis.set throws', async () => {
    redisMock.set.mockRejectedValue(new Error('redis down'));

    const result = await service.acquireLock('token789');

    expect(result).toBe(true);
    expect(redisMock.set).toHaveBeenCalledWith(
      'lock:refresh:token789',
      '1',
      expect.any(Number),
      true,
    );
  });

  it('releaseLock calls del with the lock key', async () => {
    await service.releaseLock('tok-del');

    expect(redisMock.del).toHaveBeenCalledWith('lock:refresh:tok-del');
  });
});
