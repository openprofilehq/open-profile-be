import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PortfolioItemAction } from './actions/portfolio-item.action.js';
import { CreatePortfolioItemDto } from './dto/create-portfolio-item.dto.js';
import { UpdatePortfolioItemDto } from './dto/update-portfolio-item.dto.js';
import { PortfolioItem } from './entities/portfolio-item.entity.js';

const MAX_PORTFOLIO_ITEMS = 20;

function withCharCount(item: PortfolioItem) {
  return {
    ...item,
    descriptionCharCount: item.description?.length ?? 0,
  };
}

@Injectable()
export class PortfolioService {
  constructor(private readonly portfolioItemAction: PortfolioItemAction) {}

  async create(userId: string, dto: CreatePortfolioItemDto) {
    const count = await this.portfolioItemAction.countByUserId(userId);
    if (count >= MAX_PORTFOLIO_ITEMS) {
      throw new UnprocessableEntityException(
        'You have reached the maximum of 20 portfolio items.',
      );
    }

    const item = await this.portfolioItemAction.create({
      userId,
      title: dto.title,
      description: dto.description ?? null,
      projectUrl: dto.projectUrl ?? null,
    });

    return withCharCount(item);
  }

  async update(userId: string, id: string, dto: UpdatePortfolioItemDto) {
    const item = await this.portfolioItemAction.update(id, userId, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.projectUrl !== undefined && { projectUrl: dto.projectUrl }),
    });

    if (!item) {
      throw new NotFoundException('Portfolio item not found.');
    }

    return withCharCount(item);
  }
}
