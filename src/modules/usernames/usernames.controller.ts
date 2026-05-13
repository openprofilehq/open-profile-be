import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { UsernameRateLimitGuard } from './guards/username-rate-limit.guard';
import { CheckUsernameDto } from './dto/check-username.dto';
import { UsernamesService } from './usernames.service';

@ApiTags('usernames')
@Controller('usernames')
export class UsernamesController {
  constructor(private readonly usernamesService: UsernamesService) {}

  @Public()
  @UseGuards(UsernameRateLimitGuard)
  @Get('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check username availability (public, rate-limited)',
  })
  @ApiQuery({ name: 'username', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Available' })
  @ApiResponse({ status: 400, description: 'Invalid format' })
  @ApiResponse({ status: 409, description: 'Username taken' })
  @ApiResponse({
    status: 503,
    description: 'Rate limit exceeded or service unavailable',
  })
  async check(@Query() dto: CheckUsernameDto) {
    const result = await this.usernamesService.check(dto.username);

    if (result.available) {
      return { available: true, username: result.normalizedUsername };
    }

    if (result.reason === 'INVALID_FORMAT') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'INVALID_FORMAT',
        message:
          'Username must be 3-30 characters, use only letters, numbers, and hyphens, ' +
          'and must not start, end, or contain consecutive hyphens.',
      };
    }

    return {
      statusCode: HttpStatus.CONFLICT,
      error: 'USERNAME_TAKEN',
      message: 'This username is already taken.',
    };
  }

  @Get('check/internal')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Internal username check — bypasses public rate limit, requires auth',
  })
  async checkInternal(@Query() dto: CheckUsernameDto) {
    return this.check(dto);
  }
}
