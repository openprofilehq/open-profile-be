import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  HttpCode,
  Get,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';
import { WaitListService } from './waitList.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitListService: WaitListService) {}
  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add email to wait list' })
  async addToWaitlist(@Body() dto: CreateWaitlistDto) {
    try {
      const result = await this.waitListService.addToWaitlist(dto.email);
      return {
        success: true,
        message: 'Email added to waitlist successfully',
        data: result,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to add to waitlist';

      throw new HttpException({ message }, HttpStatus.CONFLICT);
    }
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all waitlist entries with pagination' })
  async getAllWaitList(
    @Query(
      'page',
      new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
    )
    page: number = 1,
    @Query(
      'limit',
      new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
    )
    limit: number = 100,
  ) {
    try {
      const result = await this.waitListService.getAllWaitList(page, limit);
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch waitlist';
      throw new HttpException({ message }, HttpStatus.BAD_REQUEST);
    }
  }
}
