import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortfolioItem } from '../entities/portfolio-item.entity.js';

@Injectable()
export class PortfolioItemAction {
  constructor(
    @InjectRepository(PortfolioItem)
    private readonly repo: Repository<PortfolioItem>,
  ) {}

  countByUserId(userId: string): Promise<number> {
    return this.repo.count({ where: { userId } });
  }

  create(data: Partial<PortfolioItem>): Promise<PortfolioItem> {
    return this.repo.save(this.repo.create(data));
  }

  findByIdAndUserId(id: string, userId: string): Promise<PortfolioItem | null> {
    return this.repo.findOne({ where: { id, userId } });
  }

  async update(
    id: string,
    userId: string,
    data: Partial<PortfolioItem>,
  ): Promise<PortfolioItem | null> {
    const item = await this.findByIdAndUserId(id, userId);
    if (!item) return null;
    Object.assign(item, data);
    return this.repo.save(item);
  }
}
