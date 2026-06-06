import {
  Controller,
  Post,
  Body,
  HttpStatus,
  HttpCode,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { WaitlistService } from './waitlist.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('waitlist')
@Controller({ path: 'waitlist', version: '1' })
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add email to waitlist' })
  async addToWaitlist(@Body() dto: CreateWaitlistDto) {
    const result = await this.waitlistService.addToWaitlist(dto.email);
    return {
      success: true,
      message: 'Email added to waitlist successfully',
      data: result,
    };
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get all waitlist entries with pagination' })
  async getAllWaitlist(@Query() query: PaginationQueryDto) {
    const result = await this.waitlistService.getAllWaitlist(
      query.page,
      query.limit,
    );
    return {
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }
}
