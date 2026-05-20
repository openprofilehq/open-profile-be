import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiHeader,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import * as currentUserDecorator from '../../common/decorators/current-user.decorator';
import { PatchComponentDto } from './dto/patch-component.dto';
import { ReorderComponentsDto } from './dto/reorder-components.dto';
import { ProfileComponent } from './entities/profile-component.entity';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileContentDto } from './dto/profile-content.dto';
import { UpsertDraftDto } from './dto/upsert-draft.dto';
import { DraftResponse } from './types/profile-draft.types';

@ApiTags('profiles')
@Controller({ path: 'profiles', version: '1' })
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Complete onboarding with profile details' })
  @ApiResponse({ status: 201, description: 'Profile created successfully' })
  @ApiResponse({
    status: 409,
    description: 'User already has a profile or username is taken',
  })
  @ApiResponse({ status: 422, description: 'Invalid username format' })
  async createProfile(
    @Body() createProfileDto: CreateProfileDto,
    @currentUserDecorator.CurrentUser()
    user: currentUserDecorator.AuthenticatedUser,
  ) {
    return this.profileService.createProfile(createProfileDto, user);
  }

  @Put('content')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Create or update a profile draft (upsert)',
  })
  @ApiResponse({
    status: 200,
    description: 'Draft saved successfully',
    type: Object,
  })
  @ApiResponse({
    status: 404,
    description: 'Profile not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Concurrent update conflict',
  })
  async upsertDraft(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Body() dto: UpsertDraftDto,
  ): Promise<DraftResponse> {
    return this.profileService.upsertDraft(userId, dto);
  }

  @Get('content/state')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Check whether the authenticated user has an unpublished draft',
  })
  @ApiResponse({ status: 200, description: 'Draft state returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getDraftState(@currentUserDecorator.CurrentUser('sub') userId: string) {
    return this.profileService.getDraftState(userId);
  }

  @Get('content')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get full editable canvas content for authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile canvas content returned successfully',
    type: ProfileContentDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'Profile not found. Please complete onboarding first.',
  })
  async getProfileContent(
    @currentUserDecorator.CurrentUser('sub') userId: string,
  ): Promise<ProfileContentDto & { source: 'draft' | 'published' }> {
    return this.profileService.getProfileContent(userId);
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Publish authenticated user profile draft',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile published successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'No draft exists to publish',
  })
  @ApiResponse({
    status: 404,
    description: 'Profile not found',
  })
  async publishProfile(
    @currentUserDecorator.CurrentUser('sub') userId: string,
  ) {
    return this.profileService.publishProfile(userId);
  }

  @Patch(':username')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update profile fields for the authenticated user' })
  @ApiParam({ name: 'username', description: 'The profile username' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({
    status: 403,
    description: 'Profile does not belong to the authenticated user',
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 422, description: 'Validation error' })
  async updateProfile(
    @Param('username') username: string,
    @Body() dto: UpdateProfileDto,
    @currentUserDecorator.CurrentUser('sub') userId: string,
  ) {
    return this.profileService.updateProfile(username, dto, userId);
  }

  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get full current profile data for the authenticated user',
  })
  @ApiResponse({ status: 200, description: 'Profile returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 404,
    description: 'Profile not found. Please complete your profile setup.',
  })
  async getDashboardProfile(
    @currentUserDecorator.CurrentUser('sub') userId: string,
  ) {
    return this.profileService.getDashboardProfile(userId);
  }

  @Public()
  @Get(':username')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Get a public profile by username' })
  @ApiParam({ name: 'username', description: 'The profile username' })
  @ApiHeader({
    name: 'If-None-Match',
    description: 'ETag from a previous response for 304 validation',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Profile found and returned successfully',
  })
  @ApiResponse({
    status: 304,
    description: 'Not modified — ETag matches, use cached response',
  })
  @ApiResponse({
    status: 404,
    description: 'Profile not found, unpublished, or soft-deleted',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests — rate limit of 60 req/min exceeded',
  })
  async getPublicProfile(
    @Param('username') username: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { data, etag, fromCache } =
      await this.profileService.getPublicProfile(username);

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('X-Cache', fromCache ? 'HIT' : 'MISS');

    if (ifNoneMatch && ifNoneMatch === etag) {
      res.status(HttpStatus.NOT_MODIFIED);
      return;
    }

    return data;
  }

  /**
   * PATCH /profiles/me/components/:componentId
   *
   * Toggle visibility or edit a component owned by the authenticated user.
   * Global JwtAuthGuard handles auth; @CurrentUser('sub') gives us the
   * user ID (JWT subject claim).
   *
   * `displayOrder` is intentionally not patchable — the global
   * ValidationPipe with forbidNonWhitelisted: true rejects it.
   */
  @Patch('me/components/:componentId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Toggle or edit a component on the authenticated profile',
  })
  @ApiParam({ name: 'componentId', description: 'UUID of the component' })
  async patchComponent(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Param('componentId', new ParseUUIDPipe()) componentId: string,
    @Body() dto: PatchComponentDto,
  ): Promise<ProfileComponent> {
    return this.profileService.patchComponent(userId, componentId, dto);
  }

  /**
   * PUT /profiles/me/components/order
   *
   * Replace the full ordering of components for the authenticated user's
   * profile in one atomic write. The body's array order becomes the new
   * top-to-bottom display order.
   */
  @Put('me/components/order')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Reorder all components on the authenticated profile',
  })
  async reorderComponents(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Body() dto: ReorderComponentsDto,
  ): Promise<{ components: ProfileComponent[] }> {
    const components = await this.profileService.reorderComponents(userId, dto);
    return { components };
  }
}
