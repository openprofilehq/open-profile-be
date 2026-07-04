import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
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
  ApiBody,
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
import { UpsertDraftDto } from './dto/upsert-draft.dto';
import { ProfileDraftResponseDto } from './dto/profile-draft-response.dto';
import {
  ProfileResponseDto,
  DashboardProfileResponseDto,
} from './dto/profile-response.dto';
import { PublishProfileDto } from './dto/publish-profile.dto';
import { AppearanceSettingsDto } from './dto/appearance-settings.dto';
import { UpdateVisibilityDto } from './dto/update-visibility.dto';
import { VisibilityResponseDto } from './dto/visibility-response.dto';
import { Query } from '@nestjs/common';
import { ValidateLinkQueryDto } from './dto/validate-link-query.dto';
import { EventsService } from '../events/events.service';
import { EventType } from '../events/entities/event.entity';

@ApiTags('profiles')
@Controller({ path: 'profiles', version: '1' })
export class ProfileController {
  private readonly logger = new Logger(ProfileController.name);

  constructor(
    private readonly profileService: ProfileService,
    private readonly eventsService: EventsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Complete onboarding with profile details' })
  @ApiResponse({
    status: 201,
    type: ProfileResponseDto,
    description: 'Profile created successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'User already has a profile or username is taken',
  })
  @ApiResponse({
    status: 422,
    description:
      'Username format invalid — must be 3-30 characters, lowercase letters, numbers, and hyphens only. Must not start, end, or contain consecutive hyphens.',
  })
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
    summary: 'Save (upsert) a draft for the authenticated user',
    description:
      'Creates the draft row if none exists; updates it if one does. ' +
      'To guard against concurrent overwrites from another browser tab, ' +
      'send the `updatedAt` value from the last GET or PUT response as ' +
      'the `X-Draft-Version` header. Omit the header on the very first save.',
  })
  @ApiHeader({
    name: 'X-Draft-Version',
    description:
      'ISO timestamp from the last GET /profiles/content or PUT /profiles/content ' +
      'response (`updatedAt` field). Omit for the first save. ' +
      'Returns 409 if the server draft was modified after this timestamp.',
    required: false,
    example: '2026-05-19T16:05:00.000Z',
  })
  @ApiResponse({
    status: 200,
    type: ProfileDraftResponseDto,
    description: 'Draft saved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({
    status: 409,
    description: 'Concurrent edit — re-fetch and retry',
  })
  @ApiResponse({ status: 422, description: 'Content validation failed' })
  async upsertDraft(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Headers('x-draft-version') draftVersion: string | undefined,
    @Body() dto: UpsertDraftDto,
  ): Promise<ProfileDraftResponseDto> {
    return this.profileService.upsertDraft(userId, dto, draftVersion);
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
    description:
      'Returns the draft if one exists (source: "draft"), otherwise falls back to the published profile row (source: "published").',
    type: ProfileDraftResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 404,
    description: 'Profile not found. Please complete onboarding first.',
  })
  async getProfileContent(
    @currentUserDecorator.CurrentUser('sub') userId: string,
  ): Promise<ProfileDraftResponseDto> {
    return this.profileService.getProfileContent(userId);
  }

  @Public()
  @Get('validate/link')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Validate and normalise a link URL' })
  @ApiResponse({ status: 200, description: 'URL is valid' })
  @ApiResponse({ status: 422, description: 'Invalid or dangerous URL' })
  validateLink(@Query() query: ValidateLinkQueryDto) {
    return this.profileService.validateLink(query.url, query.iconId);
  }

  @Get('appearance')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get appearance settings for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Appearance settings returned successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 404,
    description: 'Profile not found',
  })
  async getAppearance(
    @currentUserDecorator.CurrentUser('sub') userId: string,
  ): Promise<{
    status: string;
    appearance: AppearanceSettingsDto;
  }> {
    return this.profileService.getAppearance(userId);
  }

  @Patch('appearance')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Save appearance settings for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Appearance settings saved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async updateAppearance(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Body() dto: AppearanceSettingsDto,
  ): Promise<{ status: string; appearance: AppearanceSettingsDto }> {
    return this.profileService.updateAppearance(userId, dto);
  }

  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get full current profile data for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    type: DashboardProfileResponseDto,
    description: 'Profile returned successfully',
  })
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

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiBody({ type: PublishProfileDto })
  @ApiOperation({
    summary: 'Publish authenticated user profile draft',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile published successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Concurrent conflict',
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
  @ApiResponse({
    status: 200,
    type: ProfileResponseDto,
    description: 'Profile updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({
    status: 403,
    description: 'Profile does not belong to the authenticated user',
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 422, description: 'Profile update validation failed' })
  async updateProfile(
    @Param('username') username: string,
    @Body() dto: UpdateProfileDto,
    @currentUserDecorator.CurrentUser('sub') userId: string,
  ) {
    return this.profileService.updateProfile(username, dto, userId);
  }

  @Public()
  @Get(':username')
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
    @Req() req: Request,
  ) {
    const { profileId, userId, data, etag, fromCache } =
      await this.profileService.getPublicProfile(username);

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('X-Cache', fromCache ? 'HIT' : 'MISS');

    if (ifNoneMatch && ifNoneMatch === etag) {
      res.status(HttpStatus.NOT_MODIFIED);
      return;
    }

    const actorId = (req as Request & { user?: { sub: string } }).user?.sub;
    const isOwner = !!actorId && actorId === userId;

    if (!isOwner) {
      void this.eventsService
        .recordEvent({
          eventType: EventType.PROFILE_VIEWED,
          profileId: profileId || undefined,
          actorId: actorId ?? undefined,
        })
        .catch((err) =>
          this.logger?.warn?.(`Failed to record PROFILE_VIEWED event: ${err}`),
        );
    }

    return data;
  }

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

  @Patch('me/visibility')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Set the authenticated profile public or private',
    description:
      'A private profile returns 404 on GET /profiles/:username for every caller, ' +
      'including the owner, and is excluded from search — effective immediately. ' +
      "The public route's Cache-Control: public, max-age=60 header still governs " +
      'downstream/browser caching of a response already served before the change.',
  })
  @ApiResponse({ status: 200, type: VisibilityResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 422, description: 'isPublic must be a boolean' })
  async updateVisibility(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Body() dto: UpdateVisibilityDto,
  ): Promise<VisibilityResponseDto> {
    return this.profileService.updateVisibility(userId, dto.isPublic);
  }
}
