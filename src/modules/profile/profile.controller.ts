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

@ApiTags('profiles')
@Controller({ path: 'profiles', version: '1' })
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
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
  @ApiBearerAuth()
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
  @ApiBearerAuth()
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
