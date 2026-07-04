import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { PaginationDto } from './dto/pagination.dto';
import { UpdateEmailDto } from './dto/update-email.dto';
import { UpdateEmailResponseDto } from './dto/update-email-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserSettingsResponseDto } from './dto/user-settings-response.dto';
import { BillingInfoResponseDto } from './dto/billing-info-response.dto';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth('JWT')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a user' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List users (paginated)' })
  findAll(@Query() pagination: PaginationDto) {
    return this.usersService.findAll(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }

  @ApiBearerAuth('JWT')
  @Post('onboarding-complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a user onboarding complete' })
  markOnboardingComplete(@CurrentUser('sub') userId: string) {
    return this.usersService.markOnboardingComplete(userId);
  }

  @Get('me/settings')
  @ApiOperation({ summary: 'Get settings for the authenticated user' })
  @ApiResponse({ status: 200, type: UserSettingsResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  getSettings(
    @CurrentUser('sub') userId: string,
  ): Promise<UserSettingsResponseDto> {
    return this.usersService.getSettings(userId);
  }

  @Get('me/billing')
  @ApiOperation({
    summary: 'Get billing info for the authenticated user',
    description:
      'Read-only. Every account is on the Free plan until the billing framework ships.',
  })
  @ApiResponse({ status: 200, type: BillingInfoResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  getBillingInfo(
    @CurrentUser('sub') userId: string,
  ): Promise<BillingInfoResponseDto> {
    return this.usersService.getBillingInfo(userId);
  }

  @Patch('me/email')
  @ApiOperation({
    summary: 'Update the email of the authenticated user',
    description:
      'Submitting the current email is a no-op and returns the current state. ' +
      'Not available for accounts signed in via an external provider (e.g. Google).',
  })
  @ApiResponse({ status: 200, type: UpdateEmailResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({
    status: 403,
    description: 'Email is managed by an external sign-in provider',
  })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @ApiResponse({ status: 422, description: 'Invalid email format' })
  updateEmail(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateEmailDto,
  ): Promise<UpdateEmailResponseDto> {
    return this.usersService.updateEmail(userId, dto);
  }
}
