import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { PortfolioItemAction } from './actions/portfolio-item.action';
import { CreatePortfolioItemDto } from './dto/create-portfolio-item.dto';
import { UpdatePortfolioItemDto } from './dto/update-portfolio-item.dto';

const mockAction = {
  countByUserId: jest.fn(),
  create: jest.fn(),
  findByIdAndUserId: jest.fn(),
  update: jest.fn(),
};

describe('PortfolioService', () => {
  let service: PortfolioService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioService,
        { provide: PortfolioItemAction, useValue: mockAction },
      ],
    }).compile();

    service = module.get<PortfolioService>(PortfolioService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const userId = 'user-1';
    const dto: CreatePortfolioItemDto = {
      title: 'My Project',
      description: 'A cool project',
      projectUrl: 'https://example.com',
      imageUrl: '/uploads/projects/uuid.jpg',
    };

    it('creates a portfolio item with imageUrl', async () => {
      mockAction.countByUserId.mockResolvedValue(0);
      mockAction.create.mockResolvedValue({
        id: 'item-1',
        userId,
        title: dto.title,
        description: dto.description,
        projectUrl: dto.projectUrl,
        imageUrl: dto.imageUrl,
      });

      const result = await service.create(userId, dto);

      expect(mockAction.create).toHaveBeenCalledWith({
        userId,
        title: dto.title,
        description: dto.description,
        projectUrl: dto.projectUrl,
        imageUrl: dto.imageUrl,
      });
      expect(result).toMatchObject({ imageUrl: dto.imageUrl });
    });

    it('creates a portfolio item without imageUrl when not provided', async () => {
      const dtoNoImage: CreatePortfolioItemDto = {
        title: 'No Image Project',
      };

      mockAction.countByUserId.mockResolvedValue(0);
      mockAction.create.mockResolvedValue({
        id: 'item-2',
        userId,
        title: dtoNoImage.title,
        description: null,
        projectUrl: null,
        imageUrl: null,
      });

      const result = await service.create(userId, dtoNoImage);

      expect(mockAction.create).toHaveBeenCalledWith({
        userId,
        title: dtoNoImage.title,
        description: null,
        projectUrl: null,
        imageUrl: null,
      });
      expect(result.imageUrl).toBeNull();
    });

    it('throws UnprocessableEntityException when limit is reached', async () => {
      mockAction.countByUserId.mockResolvedValue(20);

      await expect(service.create(userId, dto)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mockAction.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const userId = 'user-1';
    const itemId = 'item-1';

    it('updates imageUrl when provided', async () => {
      const existing = {
        id: itemId,
        userId,
        title: 'Old Title',
        imageUrl: '/uploads/projects/old.jpg',
      };
      const dto: UpdatePortfolioItemDto = {
        imageUrl: '/uploads/projects/new.jpg',
      };

      mockAction.findByIdAndUserId.mockResolvedValue(existing);
      mockAction.update.mockResolvedValue({
        ...existing,
        title: 'Old Title',
        imageUrl: dto.imageUrl,
      });

      const result = await service.update(userId, itemId, dto);

      expect(mockAction.update).toHaveBeenCalledWith(itemId, userId, {
        imageUrl: dto.imageUrl,
      });
      expect(result).toMatchObject({ imageUrl: dto.imageUrl });
    });

    it('removes imageUrl when null is sent', async () => {
      const existing = {
        id: itemId,
        userId,
        title: 'With Image',
        imageUrl: '/uploads/projects/old.jpg',
      };
      const dto: UpdatePortfolioItemDto = { imageUrl: null };

      mockAction.findByIdAndUserId.mockResolvedValue(existing);
      mockAction.update.mockResolvedValue({
        ...existing,
        imageUrl: null,
      });

      const result = await service.update(userId, itemId, dto);

      expect(mockAction.update).toHaveBeenCalledWith(itemId, userId, {
        imageUrl: null,
      });
      expect(result.imageUrl).toBeNull();
    });

    it('throws NotFoundException when item does not exist', async () => {
      mockAction.update.mockResolvedValue(null);

      await expect(
        service.update(userId, itemId, { title: 'New Title' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('withCharCount', () => {
    it('includes descriptionCharCount in response', async () => {
      const dto: CreatePortfolioItemDto = {
        title: 'Test',
        description: 'Hello World',
      };

      mockAction.countByUserId.mockResolvedValue(0);
      mockAction.create.mockResolvedValue({
        id: 'item-3',
        userId: 'user-1',
        title: dto.title,
        description: dto.description,
        projectUrl: null,
        imageUrl: null,
      });

      const result = await service.create('user-1', dto);

      expect(result).toHaveProperty('descriptionCharCount', 11);
    });
  });
});
