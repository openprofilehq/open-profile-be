import { DataSource } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Award } from '../../modules/profile/entities/award.entity';
import { Profile } from '../../modules/profile/entities/profile.entity';
import { Seeder } from './seeder.interface';

const AWARD_TITLES = [
  "Dean's List",
  'Best Paper Award',
  'Hackathon Winner',
  'Employee of the Quarter',
  'Open Source Contributor Award',
  'Innovation Award',
  'Community Leadership',
  'Teaching Excellence',
  'Outstanding Graduate',
  'Research Fellowship',
];

const ISSUERS = [
  'MIT',
  'Google',
  'ACM',
  'IEEE',
  'GitHub',
  'HackerRank',
  'Microsoft',
  'AWS',
  'Stanford University',
  'Tech Community',
];

export const awardSeeder: Seeder = {
  name: 'AwardSeeder',
  async run(dataSource: DataSource) {
    const repo = dataSource.getRepository(Award);
    const profileRepo = dataSource.getRepository(Profile);

    const existingCount = await repo.count();
    if (existingCount > 0) {
      console.log(
        `[AwardSeeder] ${existingCount} awards already exist — skipping`,
      );
      return;
    }

    const profiles = await profileRepo.find({ select: ['id'] });
    if (profiles.length === 0) {
      console.log('[AwardSeeder] no profiles found — skipping');
      return;
    }

    const entries: QueryDeepPartialEntity<Award>[] = [];
    for (const profile of profiles) {
      const count = Math.floor(Math.random() * 3); // 0-2
      for (let j = 0; j < count; j++) {
        const year = 2018 + Math.floor(Math.random() * 6);
        const month = 1 + Math.floor(Math.random() * 12);
        const day = 1 + Math.floor(Math.random() * 28);
        entries.push({
          profileId: profile.id,
          title: AWARD_TITLES[Math.floor(Math.random() * AWARD_TITLES.length)],
          issuer: ISSUERS[Math.floor(Math.random() * ISSUERS.length)],
          awardDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          description:
            'Recognized for outstanding contribution and excellence.',
          displayOrder: j,
        });
      }
    }

    if (entries.length === 0) {
      console.log('[AwardSeeder] no awards generated (random) — done');
      return;
    }

    const CHUNK = 500;
    for (let i = 0; i < entries.length; i += CHUNK) {
      await repo
        .createQueryBuilder()
        .insert()
        .into(Award)
        .values(entries.slice(i, i + CHUNK))
        .execute();
    }

    console.log(`[AwardSeeder] seeded ${entries.length} awards`);
  },
};
