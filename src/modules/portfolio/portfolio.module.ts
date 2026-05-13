import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortfolioItem } from './entities/portfolio-item.entity.js';
import { PortfolioItemAction } from './actions/portfolio-item.action.js';
import { PortfolioService } from './portfolio.service.js';
import { PortfolioController } from './portfolio.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([PortfolioItem])],
  controllers: [PortfolioController],
  providers: [PortfolioItemAction, PortfolioService],
})
export class PortfolioModule {}
