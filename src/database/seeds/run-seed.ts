import 'reflect-metadata';
import dataSource from '../data-source';
import { Seeder } from './seeder.interface';
import { userSeeder } from './user.seeder';
import { usersSeeder } from './users.seeder';
import { profileSeeder } from './profile.seeder';
import { educationSeeder } from './education.seeder';
import { workExperienceSeeder } from './work-experience.seeder';
import { skillSeeder } from './skill.seeder';
import { awardSeeder } from './award.seeder';
import { portfolioSeeder } from './portfolio.seeder';
import { inviteSeeder } from './invite.seeder';
import { eventSeeder } from './event.seeder';
import { notificationSeeder } from './notification.seeder';
import { waitlistSeeder } from './waitlist.seeder';

const seeders: Seeder[] = [
  userSeeder,
  usersSeeder,
  profileSeeder,
  educationSeeder,
  workExperienceSeeder,
  skillSeeder,
  awardSeeder,
  portfolioSeeder,
  inviteSeeder,
  eventSeeder,
  notificationSeeder,
  waitlistSeeder,
];

async function run() {
  await dataSource.initialize();
  console.log('Running seeders...');
  const start = Date.now();
  for (const seeder of seeders) {
    console.log(`> ${seeder.name}`);
    await seeder.run(dataSource);
  }
  await dataSource.destroy();
  console.log(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
