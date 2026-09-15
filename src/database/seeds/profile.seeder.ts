import { DataSource } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Profile } from '../../modules/profile/entities/profile.entity';
import { User } from '../../modules/users/entities/user.entity';
import { Seeder } from './seeder.interface';

const TEMPLATE_TYPES = ['minimal', 'classic', 'modern', 'creative', null];

export const profileSeeder: Seeder = {
  name: 'ProfileSeeder',
  async run(dataSource: DataSource) {
    const profileRepo = dataSource.getRepository(Profile);
    const userRepo = dataSource.getRepository(User);

    const existingCount = await profileRepo.count();
    if (existingCount > 0) {
      console.log(
        `[ProfileSeeder] ${existingCount} profiles already exist - skipping`,
      );
      return;
    }

    const users = await userRepo.find({ order: { createdAt: 'ASC' } });
    if (users.length === 0) {
      console.log('[ProfileSeeder] no users found - skipping');
      return;
    }

    const profiles: QueryDeepPartialEntity<Profile>[] = [];
    const publishRate = 0.6;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const shouldPublish = i / users.length < publishRate;
      const publishedAt = shouldPublish
        ? new Date(
            Date.now() - Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000,
          )
        : null;

      profiles.push({
        userId: user.id,
        username: user.username ?? `user-${i}`,
        fullName: user.fullName ?? `User ${i}`,
        bio: user.bio,
        templateType: TEMPLATE_TYPES[i % TEMPLATE_TYPES.length],
        isPublished: shouldPublish,
        publishedAt,
        isSearchable: shouldPublish,
        isPublic: true,
        viewCount: shouldPublish ? Math.floor(Math.random() * 500) : 0,
      });
    }

    await profileRepo
      .createQueryBuilder()
      .insert()
      .into(Profile)
      .values(profiles)
      .orIgnore()
      .execute();

    console.log(
      `[ProfileSeeder] seeded ${profiles.length} profiles (${Math.round(publishRate * 100)}% published)`,
    );
  },
};
