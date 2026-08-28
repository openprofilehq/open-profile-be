import { DataSource } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Skill } from '../../modules/profile/entities/skill.entity';
import { Profile } from '../../modules/profile/entities/profile.entity';
import { Seeder } from './seeder.interface';

const SKILL_POOL = [
  'TypeScript',
  'JavaScript',
  'React',
  'Next.js',
  'Node.js',
  'Python',
  'Go',
  'Rust',
  'Java',
  'C#',
  'PostgreSQL',
  'MongoDB',
  'Redis',
  'Docker',
  'Kubernetes',
  'AWS',
  'GCP',
  'Azure',
  'GraphQL',
  'REST APIs',
  'Git',
  'CI/CD',
  'Figma',
  'Tailwind CSS',
  'Vue.js',
  'Angular',
  'Swift',
  'Kotlin',
  'Flutter',
  'Django',
  'NestJS',
  'Express.js',
  'Linux',
  'Terraform',
  'Prometheus',
  'Elasticsearch',
];

const LEVELS = ['beginner', 'intermediate', 'advanced', 'expert', null];

export const skillSeeder: Seeder = {
  name: 'SkillSeeder',
  async run(dataSource: DataSource) {
    const repo = dataSource.getRepository(Skill);
    const profileRepo = dataSource.getRepository(Profile);

    const existingCount = await repo.count();
    if (existingCount > 0) {
      console.log(
        `[SkillSeeder] ${existingCount} skills already exist - skipping`,
      );
      return;
    }

    const profiles = await profileRepo.find({ select: ['id'] });
    if (profiles.length === 0) {
      console.log('[SkillSeeder] no profiles found - skipping');
      return;
    }

    const entries: QueryDeepPartialEntity<Skill>[] = [];
    for (const profile of profiles) {
      const count = 3 + Math.floor(Math.random() * 6);
      const shuffled = [...SKILL_POOL].sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, count);

      for (let j = 0; j < picked.length; j++) {
        entries.push({
          profileId: profile.id,
          name: picked[j],
          level: LEVELS[Math.floor(Math.random() * LEVELS.length)],
          displayOrder: j,
        });
      }
    }

    const CHUNK = 500;
    for (let i = 0; i < entries.length; i += CHUNK) {
      await repo
        .createQueryBuilder()
        .insert()
        .into(Skill)
        .values(entries.slice(i, i + CHUNK))
        .execute();
    }

    console.log(`[SkillSeeder] seeded ${entries.length} skills`);
  },
};
