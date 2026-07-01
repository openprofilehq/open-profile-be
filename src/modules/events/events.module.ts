import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { Event } from './entities/event.entity';
import { Profile } from '../profile/entities/profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Event, Profile])],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
