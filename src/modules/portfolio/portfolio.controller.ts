import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import { CreatePortfolioItemDto } from './dto/create-portfolio-item.dto.js';
import { UpdatePortfolioItemDto } from './dto/update-portfolio-item.dto.js';
import { PortfolioService } from './portfolio.service.js';

@ApiTags('portfolio')
@ApiBearerAuth()
@Controller('profiles/me/portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a portfolio item to the authenticated user profile',
  })
  @ApiResponse({ status: 201, description: 'Portfolio item created.' })
  @ApiResponse({
    status: 422,
    description: 'Validation error or item limit reached.',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePortfolioItemDto,
  ) {
    return this.portfolioService.create(user.sub, dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a portfolio item owned by the authenticated user',
  })
  @ApiResponse({ status: 200, description: 'Portfolio item updated.' })
  @ApiResponse({ status: 404, description: 'Portfolio item not found.' })
  @ApiResponse({ status: 422, description: 'Validation error.' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePortfolioItemDto,
  ) {
    return this.portfolioService.update(user.sub, id, dto);
  }
}
