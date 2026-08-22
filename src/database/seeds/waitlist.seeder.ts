import { DataSource } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Waitlist } from '../../modules/waitlist/entities/waitlist.entity';
import { Seeder } from './seeder.interface';

const WAITLIST_COUNT = 20;

export const waitlistSeeder: Seeder = {
  name: 'WaitlistSeeder',
  async run(dataSource: DataSource) {
    const repo = dataSource.getRepository(Waitlist);

    const existingCount = await repo.count();
    if (existingCount > 0) {
      console.log(
        `[WaitlistSeeder] ${existingCount} entries already exist — skipping`,
      );
      return;
    }

    const entries: QueryDeepPartialEntity<Waitlist>[] = [];
    for (let i = 0; i < WAITLIST_COUNT; i++) {
      entries.push({
        email: `waitlist-${i + 1}@example.com`,
        emailSent: i < WAITLIST_COUNT / 2,
      });
    }

    await repo
      .createQueryBuilder()
      .insert()
      .into(Waitlist)
      .values(entries)
      .orIgnore()
      .execute();

    console.log(`[WaitlistSeeder] seeded ${entries.length} waitlist entries`);
  },
};
