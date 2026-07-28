import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v7: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

jest.mock('../../config/env', () => ({
  env: {},
}));

describe('InvitesController', () => {
  let controller: InvitesController;
  let invitesService: jest.Mocked<
    Pick<InvitesService, 'createInvite' | 'recordInviteClick'>
  >;

  const req = {
    user: { sub: 'user-id' },
  } as Parameters<InvitesController['createInvite']>[0];

  beforeEach(() => {
    invitesService = {
      createInvite: jest.fn(),
      recordInviteClick: jest.fn(),
    };

    controller = new InvitesController(
      invitesService as unknown as InvitesService,
    );
  });

  it('POST /invites passes the authenticated user id and body through', async () => {
    const dto = { recipientEmail: 'friend@example.com' };
    const result = {
      id: 'invite-id',
      recipientEmail: dto.recipientEmail,
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
    };
    invitesService.createInvite.mockResolvedValue(result);

    await expect(controller.createInvite(req, dto)).resolves.toEqual(result);

    expect(invitesService.createInvite).toHaveBeenCalledWith('user-id', dto);
  });

  it('enforces JwtAuthGuard on POST /invites', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        InvitesController.prototype.createInvite,
      ),
    ).toContain(JwtAuthGuard);
  });

  it('GET /invites/:token records the invite click and returns the lookup response', async () => {
    const result = {
      recipientEmail: 'friend@example.com',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
    };
    invitesService.recordInviteClick.mockResolvedValue(result);

    await expect(controller.getInvite('invite-token')).resolves.toEqual(result);

    expect(invitesService.recordInviteClick).toHaveBeenCalledWith(
      'invite-token',
    );
  });

  it('marks GET /invites/:token as public', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, InvitesController.prototype.getInvite),
    ).toBe(true);
  });
});
