import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AdminUsersController } from './admin-users.controller';

describe('AdminUsersController', () => {
  let controller: AdminUsersController;
  let adminUsersService: {
    searchUsers: jest.Mock;
    getUserDetail: jest.Mock;
    changeStatus: jest.Mock;
  };

  beforeEach(() => {
    adminUsersService = {
      searchUsers: jest.fn(),
      getUserDetail: jest.fn(),
      changeStatus: jest.fn(),
    };
    controller = new AdminUsersController(adminUsersService as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('delegation', () => {
    it('delegates searchUsers to the service', async () => {
      const query = { q: 'john', page: 1, limit: 10 };
      adminUsersService.searchUsers.mockResolvedValue({ users: [], total: 0 });

      const result = await controller.searchUsers(query as never);

      expect(adminUsersService.searchUsers).toHaveBeenCalledWith(query);
      expect(result).toEqual({
        success: true,
        data: { users: [], total: 0 },
      });
    });

    it('delegates getUserDetail to the service', async () => {
      const user = { id: 'user-1', fullName: 'John' };
      adminUsersService.getUserDetail.mockResolvedValue(user);

      const result = await controller.getUserDetail('user-1');

      expect(adminUsersService.getUserDetail).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ success: true, data: user });
    });

    it('delegates updateUserStatus to the service', async () => {
      const transition = { from: 'active', to: 'blocked', changed: true };
      adminUsersService.changeStatus.mockResolvedValue(transition);

      const result = await controller.updateUserStatus(
        'user-1',
        { action: 'block' } as never,
        { user: { sub: 'admin-1' } } as never,
      );

      expect(adminUsersService.changeStatus).toHaveBeenCalledWith(
        'user-1',
        'block',
        'admin-1',
      );
      expect(result).toEqual({ success: true, data: transition });
    });
  });

  describe('decorator audit', () => {
    const reflector = new Reflector();

    it('requires ADMIN role on searchUsers', () => {
      const roles = reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        AdminUsersController.prototype.searchUsers,
        AdminUsersController,
      ]);
      expect(roles).toEqual([UserRole.ADMIN]);
    });

    it('requires ADMIN role on getUserDetail', () => {
      const roles = reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        AdminUsersController.prototype.getUserDetail,
        AdminUsersController,
      ]);
      expect(roles).toEqual([UserRole.ADMIN]);
    });

    it('requires ADMIN role on updateUserStatus', () => {
      const roles = reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        AdminUsersController.prototype.updateUserStatus,
        AdminUsersController,
      ]);
      expect(roles).toEqual([UserRole.ADMIN]);
    });

    it('applies RolesGuard to all routes', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, AdminUsersController);
      expect(guards).toContain(RolesGuard);
    });
  });
});
