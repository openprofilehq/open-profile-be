import { User } from '../users/entities/user.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../../common/redis/redis.module';
import { Profile } from './entities/profile.entity';
import { ProfileComponent } from './entities/profile-component.entity';
import { ProfileDraft } from './entities/profile-draft.entity';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UsersModule } from '../users/users.module';
import { UsernamesModule } from '../usernames/usernames.module';
import { EventsModule } from '../events/events.module';
import { Skill } from './entities/skill.entity';
import { Education } from './entities/education.entity';
import { WorkExperience } from './entities/work-experience.entity';
import { Award } from './entities/award.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Profile,
      ProfileComponent,
      ProfileDraft,
      User,
      Skill,
      Education,
      WorkExperience,
      Award,
    ]),
    RedisModule,
    UsersModule,
    UsernamesModule,
    EventsModule,
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
