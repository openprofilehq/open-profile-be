import { DataSource } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import * as bcrypt from 'bcrypt';
import {
  User,
  UserRole,
  AuthProvider,
  UserStatus,
} from '../../modules/users/entities/user.entity';
import { Seeder } from './seeder.interface';

const FIRST_NAMES = [
  'Alice',
  'Bob',
  'Charlie',
  'Diana',
  'Eve',
  'Frank',
  'Grace',
  'Hank',
  'Irene',
  'Jack',
  'Kara',
  'Leo',
  'Mia',
  'Noah',
  'Olivia',
  'Paul',
  'Quinn',
  'Ruby',
  'Sam',
  'Tina',
  'Uma',
  'Vince',
  'Wendy',
  'Xander',
  'Yara',
  'Zane',
  'Amber',
  'Blake',
  'Clara',
  'Derek',
  'Elena',
  'Felix',
  'Gina',
  'Hugo',
  'Isla',
  'Jade',
  'Kyle',
  'Luna',
  'Marco',
  'Nina',
  'Oscar',
  'Piper',
  'Reed',
  'Sage',
  'Troy',
  'Vera',
  'Wade',
  'Zara',
  'Axel',
  'Beth',
];

const LAST_NAMES = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
  'Hernandez',
  'Lopez',
  'Gonzalez',
  'Wilson',
  'Anderson',
  'Thomas',
  'Taylor',
  'Moore',
  'Jackson',
  'Martin',
  'Lee',
  'Perez',
  'Thompson',
  'White',
  'Harris',
  'Sanchez',
  'Clark',
  'Ramirez',
  'Lewis',
  'Robinson',
  'Walker',
  'Young',
  'Allen',
  'King',
  'Wright',
  'Scott',
  'Torres',
  'Nguyen',
  'Hill',
  'Flores',
  'Green',
  'Adams',
  'Nelson',
  'Baker',
  'Hall',
  'Rivera',
  'Campbell',
  'Mitchell',
  'Carter',
  'Roberts',
];

const BIOS = [
  'Full-stack developer passionate about building scalable web apps.',
  'UX designer focused on creating intuitive digital experiences.',
  'Backend engineer with a love for distributed systems.',
  'Product manager turning ideas into impactful products.',
  'Data scientist exploring patterns in complex datasets.',
  'Mobile developer crafting smooth native experiences.',
  'DevOps engineer automating everything.',
  'Frontend developer obsessed with pixel-perfect UI.',
  'Security researcher keeping the web safe.',
  'Machine learning engineer building intelligent systems.',
];

const USER_COUNT = parseInt(process.env.SEED_USER_COUNT ?? '50', 10);

export const usersSeeder: Seeder = {
  name: 'UsersSeeder',
  async run(dataSource: DataSource) {
    const repo = dataSource.getRepository(User);
    const existing = await repo.count();
    if (existing >= USER_COUNT) {
      console.log(
        `[UsersSeeder] ${existing} users already exist (>= ${USER_COUNT}) — skipping`,
      );
      return;
    }

    const passwordHash = await bcrypt.hash('Seeded@123456', 10);
    const users: QueryDeepPartialEntity<User>[] = [];

    for (let i = 0; i < USER_COUNT; i++) {
      const first = FIRST_NAMES[i % FIRST_NAMES.length];
      const last = LAST_NAMES[i % LAST_NAMES.length];
      const suffix = i < FIRST_NAMES.length ? '' : `${i}`;
      const email = `${first.toLowerCase()}${suffix}.${last.toLowerCase()}@seed.local`;
      const username = `${first.toLowerCase()}${suffix}-${last.toLowerCase()}`;

      users.push({
        email,
        password: passwordHash,
        fullName: `${first} ${last}`,
        username,
        bio: BIOS[i % BIOS.length],
        role: i === 0 ? UserRole.ADMIN : UserRole.USER,
        status: UserStatus.ACTIVE,
        authProvider: AuthProvider.EMAIL,
        isVerified: true,
        onboardingComplete: i < USER_COUNT * 0.8,
        isPublished: false,
      });
    }

    await repo
      .createQueryBuilder()
      .insert()
      .into(User)
      .values(users)
      .orIgnore()
      .execute();

    console.log(`[UsersSeeder] seeded ${users.length} users`);
  },
};
