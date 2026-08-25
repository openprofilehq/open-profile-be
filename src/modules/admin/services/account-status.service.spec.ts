import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../../../common/redis/redis.service';
import { User, UserStatus } from '../../users/entities/user.entity';
import { UserStatusHistory } from '../entities/user-status-history.entity';
import { AccountStatusService } from './account-status.service';

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const ADMIN_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function userWith(status: UserStatus): User {
  return { id: USER_ID, status } as User;
}

describe('AccountStatusService', () => {
  let service: AccountStatusService;
  let userRepo: { findOne: jest.Mock; update: jest.Mock };
  let userTxRepo: { update: jest.Mock };
  let historyRepo: { insert: jest.Mock };
  let dataSource: {
    getRepository: jest.Mock;
    transaction: jest.Mock;
  };
  let redis: { del: jest.Mock };

  beforeEach(async () => {
    userRepo = { findOne: jest.fn(), update: jest.fn() };
    userTxRepo = { update: jest.fn() };
    historyRepo = { insert: jest.fn() };

    dataSource = {
      getRepository: jest.fn().mockReturnValue(userRepo),
      transaction: jest.fn(async (cb: (manager: unknown) => unknown) =>
        cb({
          getRepository: (entity: unknown) =>
            entity === User ? userTxRepo : historyRepo,
        }),
      ),
    };
    redis = { del: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountStatusService,
        { provide: DataSource, useValue: dataSource },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(AccountStatusService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('blocks an active user, audits the transition, and invalidates the cache', async () => {
    userRepo.findOne.mockResolvedValue(userWith(UserStatus.ACTIVE));

    const result = await service.block(USER_ID, ADMIN_ID);

    expect(result).toEqual({
      from: UserStatus.ACTIVE,
      to: UserStatus.BLOCKED,
      changed: true,
    });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(userTxRepo.update).toHaveBeenCalledWith(USER_ID, {
      status: UserStatus.BLOCKED,
    });
    expect(historyRepo.insert).toHaveBeenCalledWith({
      userId: USER_ID,
      fromStatus: UserStatus.ACTIVE,
      toStatus: UserStatus.BLOCKED,
      changedBy: ADMIN_ID,
    });
    expect(redis.del).toHaveBeenCalledWith(`user:status:${USER_ID}`);
  });

  it('suspends a flagged_for_review user', async () => {
    userRepo.findOne.mockResolvedValue(userWith(UserStatus.FLAGGED_FOR_REVIEW));

    const result = await service.suspend(USER_ID, ADMIN_ID);

    expect(result.to).toBe(UserStatus.SUSPENDED);
    expect(userTxRepo.update).toHaveBeenCalledWith(USER_ID, {
      status: UserStatus.SUSPENDED,
    });
    expect(redis.del).toHaveBeenCalledWith(`user:status:${USER_ID}`);
  });

  it('deactivates a suspended user', async () => {
    userRepo.findOne.mockResolvedValue(userWith(UserStatus.SUSPENDED));

    const result = await service.deactivate(USER_ID, ADMIN_ID);

    expect(result.to).toBe(UserStatus.DEACTIVATED);
    expect(redis.del).toHaveBeenCalledWith(`user:status:${USER_ID}`);
  });

  it('reactivates a deactivated user', async () => {
    userRepo.findOne.mockResolvedValue(userWith(UserStatus.DEACTIVATED));

    const result = await service.reactivate(USER_ID, ADMIN_ID);

    expect(result.to).toBe(UserStatus.ACTIVE);
    expect(redis.del).toHaveBeenCalledWith(`user:status:${USER_ID}`);
  });

  it('flags an active user for review', async () => {
    userRepo.findOne.mockResolvedValue(userWith(UserStatus.ACTIVE));

    const result = await service.flagForReview(USER_ID, ADMIN_ID);

    expect(result.to).toBe(UserStatus.FLAGGED_FOR_REVIEW);
    expect(redis.del).toHaveBeenCalledWith(`user:status:${USER_ID}`);
  });

  it('is a no-op when the user already has the target status', async () => {
    userRepo.findOne.mockResolvedValue(userWith(UserStatus.BLOCKED));

    const result = await service.block(USER_ID, ADMIN_ID);

    expect(result).toEqual({
      from: UserStatus.BLOCKED,
      to: UserStatus.BLOCKED,
      changed: false,
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('rejects an invalid transition with a 409', async () => {
    userRepo.findOne.mockResolvedValue(userWith(UserStatus.DEACTIVATED));

    await expect(service.block(USER_ID, ADMIN_ID)).rejects.toThrow(
      ConflictException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('throws a 404 when the user does not exist', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await expect(service.suspend(USER_ID, ADMIN_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
