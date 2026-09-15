import { DataSource } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Education } from '../../modules/profile/entities/education.entity';
import { Profile } from '../../modules/profile/entities/profile.entity';
import { Seeder } from './seeder.interface';

const SCHOOLS = [
  'MIT',
  'Stanford University',
  'University of Oxford',
  'ETH Zürich',
  'University of Cambridge',
  'Harvard University',
  'UC Berkeley',
  'Imperial College London',
  'University of Toronto',
  'NUS Singapore',
  'TU Munich',
  'Georgia Tech',
  'Carnegie Mellon',
  'University of Tokyo',
  'Seoul National University',
];

const DEGREES = [
  'B.Sc. Computer Science',
  'M.Sc. Software Engineering',
  'B.A. Design',
  'M.Sc. Data Science',
  'B.Eng. Electrical Engineering',
  'Ph.D. Machine Learning',
  'B.Sc. Mathematics',
  'M.B.A.',
  'B.Sc. Information Systems',
  'M.Sc. Cybersecurity',
];

const FIELDS = [
  'Computer Science',
  'Software Engineering',
  'Data Science',
  'Information Technology',
  'Electrical Engineering',
  'Mathematics',
  'Business Administration',
  'Design',
  'Cybersecurity',
  'AI & ML',
];

export const educationSeeder: Seeder = {
  name: 'EducationSeeder',
  async run(dataSource: DataSource) {
    const educationRepo = dataSource.getRepository(Education);
    const profileRepo = dataSource.getRepository(Profile);

    const existingCount = await educationRepo.count();
    if (existingCount > 0) {
      console.log(
        `[EducationSeeder] ${existingCount} entries already exist - skipping`,
      );
      return;
    }

    const profiles = await profileRepo.find({ select: ['id'] });
    if (profiles.length === 0) {
      console.log('[EducationSeeder] no profiles found - skipping');
      return;
    }

    const entries: QueryDeepPartialEntity<Education>[] = [];
    for (const profile of profiles) {
      const count = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < count; j++) {
        const startYear = 2010 + Math.floor(Math.random() * 10);
        entries.push({
          profileId: profile.id,
          school: SCHOOLS[Math.floor(Math.random() * SCHOOLS.length)],
          degree: DEGREES[Math.floor(Math.random() * DEGREES.length)],
          fieldOfStudy: FIELDS[Math.floor(Math.random() * FIELDS.length)],
          startYear,
          endYear: startYear + 2 + Math.floor(Math.random() * 3),
          displayOrder: j,
        });
      }
    }

    const CHUNK = 500;
    for (let i = 0; i < entries.length; i += CHUNK) {
      await educationRepo
        .createQueryBuilder()
        .insert()
        .into(Education)
        .values(entries.slice(i, i + CHUNK))
        .execute();
    }

    console.log(`[EducationSeeder] seeded ${entries.length} education entries`);
  },
};
