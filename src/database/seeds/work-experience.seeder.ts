import { DataSource } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { WorkExperience } from '../../modules/profile/entities/work-experience.entity';
import { Profile } from '../../modules/profile/entities/profile.entity';
import { Seeder } from './seeder.interface';

const COMPANIES = [
  'Google',
  'Microsoft',
  'Apple',
  'Amazon',
  'Meta',
  'Netflix',
  'Spotify',
  'Stripe',
  'Shopify',
  'Airbnb',
  'Uber',
  'Slack',
  'Figma',
  'Vercel',
  'Cloudflare',
  'Datadog',
  'Twilio',
  'Square',
  'Notion',
  'Linear',
];

const JOB_TITLES = [
  'Software Engineer',
  'Senior Software Engineer',
  'Staff Engineer',
  'Frontend Developer',
  'Backend Developer',
  'Full-Stack Developer',
  'DevOps Engineer',
  'Product Manager',
  'UX Designer',
  'Data Engineer',
  'Engineering Manager',
  'Technical Lead',
  'Solutions Architect',
  'Site Reliability Engineer',
  'Mobile Developer',
];

const LOCATIONS = [
  'San Francisco, CA',
  'New York, NY',
  'London, UK',
  'Berlin, Germany',
  'Toronto, Canada',
  'Remote',
  'Austin, TX',
  'Seattle, WA',
  'Singapore',
  'Amsterdam, Netherlands',
];

export const workExperienceSeeder: Seeder = {
  name: 'WorkExperienceSeeder',
  async run(dataSource: DataSource) {
    const repo = dataSource.getRepository(WorkExperience);
    const profileRepo = dataSource.getRepository(Profile);

    const existingCount = await repo.count();
    if (existingCount > 0) {
      console.log(
        `[WorkExperienceSeeder] ${existingCount} entries already exist — skipping`,
      );
      return;
    }

    const profiles = await profileRepo.find({ select: ['id'] });
    if (profiles.length === 0) {
      console.log('[WorkExperienceSeeder] no profiles found — skipping');
      return;
    }

    const entries: QueryDeepPartialEntity<WorkExperience>[] = [];
    for (const profile of profiles) {
      const count = 1 + Math.floor(Math.random() * 4); // 1-4
      for (let j = 0; j < count; j++) {
        const startYear = 2015 + Math.floor(Math.random() * 8);
        const startMonth = 1 + Math.floor(Math.random() * 12);
        const isCurrent = j === 0 && Math.random() > 0.3;

        entries.push({
          profileId: profile.id,
          companyName: COMPANIES[Math.floor(Math.random() * COMPANIES.length)],
          jobTitle: JOB_TITLES[Math.floor(Math.random() * JOB_TITLES.length)],
          location: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)],
          description: `Worked on building scalable systems and collaborating with cross-functional teams.`,
          startMonth,
          startYear,
          endMonth: isCurrent ? null : 1 + Math.floor(Math.random() * 12),
          endYear: isCurrent
            ? null
            : startYear + 1 + Math.floor(Math.random() * 2),
          isCurrent,
          displayOrder: j,
        });
      }
    }

    const CHUNK = 500;
    for (let i = 0; i < entries.length; i += CHUNK) {
      await repo
        .createQueryBuilder()
        .insert()
        .into(WorkExperience)
        .values(entries.slice(i, i + CHUNK))
        .execute();
    }

    console.log(
      `[WorkExperienceSeeder] seeded ${entries.length} work experience entries`,
    );
  },
};
