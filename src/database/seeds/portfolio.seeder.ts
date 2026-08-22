import { DataSource } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { PortfolioItem } from '../../modules/portfolio/entities/portfolio-item.entity';
import { User } from '../../modules/users/entities/user.entity';
import { Seeder } from './seeder.interface';

const PROJECT_TITLES = [
  'E-Commerce Platform',
  'Portfolio Website',
  'Task Management App',
  'Chat Application',
  'Weather Dashboard',
  'Blog Engine',
  'Social Media Clone',
  'Music Streaming UI',
  'Fitness Tracker',
  'Recipe Finder',
  'Budget Planner',
  'Travel Diary',
  'Job Board',
  'Learning Management System',
  'Inventory Manager',
];

const DESCRIPTIONS = [
  'A modern web application built with React and Node.js.',
  'Full-stack project featuring real-time updates and responsive design.',
  'Mobile-first application with offline support and push notifications.',
  'Collaborative tool with role-based access and analytics dashboard.',
  'Clean, minimal design with smooth animations and dark mode support.',
];

export const portfolioSeeder: Seeder = {
  name: 'PortfolioSeeder',
  async run(dataSource: DataSource) {
    const repo = dataSource.getRepository(PortfolioItem);
    const userRepo = dataSource.getRepository(User);

    const existingCount = await repo.count();
    if (existingCount > 0) {
      console.log(
        `[PortfolioSeeder] ${existingCount} items already exist — skipping`,
      );
      return;
    }

    const users = await userRepo.find({ select: ['id'] });
    if (users.length === 0) {
      console.log('[PortfolioSeeder] no users found — skipping');
      return;
    }

    const entries: QueryDeepPartialEntity<PortfolioItem>[] = [];
    for (const user of users) {
      const count = 1 + Math.floor(Math.random() * 3); // 1-3
      for (let j = 0; j < count; j++) {
        entries.push({
          userId: user.id,
          title:
            PROJECT_TITLES[Math.floor(Math.random() * PROJECT_TITLES.length)],
          description:
            DESCRIPTIONS[Math.floor(Math.random() * DESCRIPTIONS.length)],
          projectUrl: `https://github.com/seed-user/project-${j + 1}`,
        });
      }
    }

    const CHUNK = 500;
    for (let i = 0; i < entries.length; i += CHUNK) {
      await repo
        .createQueryBuilder()
        .insert()
        .into(PortfolioItem)
        .values(entries.slice(i, i + CHUNK))
        .execute();
    }

    console.log(`[PortfolioSeeder] seeded ${entries.length} portfolio items`);
  },
};
