import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchAction } from './actions/search.action';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { Profile } from '../profile/entities/profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Profile])],
  controllers: [SearchController],
  providers: [SearchAction, SearchService],
})
export class SearchModule {}
