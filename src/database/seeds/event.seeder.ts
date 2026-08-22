import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { Profile } from '../../modules/profile/entities/profile.entity';
import { User } from '../../modules/users/entities/user.entity';
import { Seeder } from './seeder.interface';

const EVENT_COUNT = parseInt(process.env.SEED_EVENT_COUNT ?? '20000', 10);
const BATCH_SIZE = 5_000;
const SPREAD_DAYS = 90;

const EVENT_TYPES: { type: string; weight: number }[] = [
  { type: 'PROFILE_VIEWED', weight: 0.5 },
  { type: 'SEARCH_PERFORMED', weight: 0.75 },
  { type: 'LINK_CLICKED', weight: 0.9 },
  { type: 'INVITE_SENT', weight: 0.95 },
  { type: 'INVITE_CLAIMED', weight: 1.0 },
];

function pickEventType(): string {
  const r = Math.random();
  for (const { type, weight } of EVENT_TYPES) {
    if (r < weight) return type;
  }
  return 'PROFILE_VIEWED';
}

export const eventSeeder: Seeder = {
  name: 'EventSeeder',
  async run(dataSource: DataSource) {
    const eventCount = await dataSource.query<{ count: string }[]>(
      'SELECT COUNT(*)::bigint AS count FROM events',
    );
    const existing = Number(eventCount[0].count);
    if (existing >= EVENT_COUNT) {
      console.log(
        `[EventSeeder] ${existing} events already exist (>= ${EVENT_COUNT}) - skipping`,
      );
      return;
    }

    const profiles = await dataSource.getRepository(Profile).find({
      select: ['id'],
      where: { isPublished: true },
    });
    const users = await dataSource.getRepository(User).find({
      select: ['id'],
    });

    if (profiles.length === 0 || users.length === 0) {
      console.log('[EventSeeder] no profiles/users found - skipping');
      return;
    }

    const profileIds = profiles.map((p) => p.id);
    const userIds = users.map((u) => u.id);

    const toInsert = EVENT_COUNT - existing;
    const now = Date.now();
    const spreadMs = SPREAD_DAYS * 24 * 60 * 60 * 1000;

    console.log(
      `[EventSeeder] inserting ${toInsert.toLocaleString()} events in batches of ${BATCH_SIZE.toLocaleString()}...`,
    );

    let inserted = 0;
    while (inserted < toInsert) {
      const batchSize = Math.min(BATCH_SIZE, toInsert - inserted);

      const values: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      for (let i = 0; i < batchSize; i++) {
        const eventType = pickEventType();
        const occurredAt = new Date(
          now - Math.floor(Math.random() * spreadMs),
        ).toISOString();

        const profileId =
          eventType === 'PROFILE_VIEWED' || eventType === 'LINK_CLICKED'
            ? profileIds[Math.floor(Math.random() * profileIds.length)]
            : null;

        const actorId =
          Math.random() > 0.3
            ? userIds[Math.floor(Math.random() * userIds.length)]
            : null;

        const anonymousId = actorId === null ? randomUUID() : null;

        values.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`,
        );
        params.push(eventType, actorId, anonymousId, profileId, occurredAt);
      }

      const sql = `
        INSERT INTO events ("eventType", "actorId", "anonymousId", "profileId", "occurredAt")
        VALUES ${values.join(', ')}
      `;

      await dataSource.query(sql, params);
      inserted += batchSize;

      if (inserted % 50_000 === 0 || inserted >= toInsert) {
        console.log(
          `[EventSeeder]   ${inserted.toLocaleString()} / ${toInsert.toLocaleString()} inserted`,
        );
      }
    }

    console.log(
      `[EventSeeder] seeded ${toInsert.toLocaleString()} events (total: ${EVENT_COUNT.toLocaleString()})`,
    );
  },
};
