import { DataSource } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { randomUUID } from 'crypto';
import { Invite } from '../../modules/invites/entities/invite.entity';
import { User } from '../../modules/users/entities/user.entity';
import { Seeder } from './seeder.interface';

const INVITE_COUNT = parseInt(process.env.SEED_INVITE_COUNT ?? '100', 10);

export const inviteSeeder: Seeder = {
  name: 'InviteSeeder',
  async run(dataSource: DataSource) {
    const repo = dataSource.getRepository(Invite);
    const userRepo = dataSource.getRepository(User);

    const existingCount = await repo.count();
    if (existingCount > 0) {
      console.log(
        `[InviteSeeder] ${existingCount} invites already exist - skipping`,
      );
      return;
    }

    const users = await userRepo.find({
      select: ['id'],
      order: { createdAt: 'ASC' },
    });
    if (users.length < 2) {
      console.log('[InviteSeeder] need >= 2 users - skipping');
      return;
    }

    const entries: QueryDeepPartialEntity<Invite>[] = [];
    const now = Date.now();

    for (let i = 0; i < INVITE_COUNT; i++) {
      const inviterIdx = Math.floor(Math.random() * users.length);
      let recipientIdx = Math.floor(Math.random() * users.length);
      while (recipientIdx === inviterIdx) {
        recipientIdx = Math.floor(Math.random() * users.length);
      }

      const createdDaysAgo = Math.floor(Math.random() * 60);
      const createdAt = new Date(now - createdDaysAgo * 24 * 60 * 60 * 1000);
      const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);

      const isClaimed = Math.random() > 0.6;
      const isClicked = isClaimed || Math.random() > 0.5;

      entries.push({
        inviterUserId: users[inviterIdx].id,
        recipientEmail: `invite-${i}@seed.local`,
        token: randomUUID(),
        expiresAt,
        clickedAt: isClicked
          ? new Date(
              createdAt.getTime() +
                Math.floor(Math.random() * 2) * 24 * 60 * 60 * 1000,
            )
          : null,
        claimedAt: isClaimed
          ? new Date(
              createdAt.getTime() +
                Math.floor(Math.random() * 3 + 1) * 24 * 60 * 60 * 1000,
            )
          : null,
        claimedByUserId: isClaimed ? users[recipientIdx].id : null,
      });
    }

    const CHUNK = 500;
    for (let i = 0; i < entries.length; i += CHUNK) {
      await repo
        .createQueryBuilder()
        .insert()
        .into(Invite)
        .values(entries.slice(i, i + CHUNK))
        .orIgnore()
        .execute();
    }

    console.log(`[InviteSeeder] seeded ${entries.length} invites`);
  },
};
