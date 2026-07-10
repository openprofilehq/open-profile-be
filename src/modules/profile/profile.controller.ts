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
  Delete,
} from '@nestjs/common';
import type { Request, Response } from 'express';
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
import { Skill } from './entities/skill.entity';
import { WorkExperience } from './entities/work-experience.entity';
import {
  CreateWorkExperienceDto,
  UpdateWorkExperienceDto,
  ReorderWorkExperienceDto,
} from './dto/work-experience.dto';
import {
  CreateSkillDto,
  UpdateSkillDto,
  ReorderSkillsDto,
} from './dto/skill.dto';
import { Education } from './entities/education.entity';
import {
  CreateEducationDto,
  UpdateEducationDto,
  ReorderEducationDto,
} from './dto/education.dto';
import { Award } from './entities/award.entity';
import {
  CreateAwardDto,
  UpdateAwardDto,
  ReorderAwardsDto,
} from './dto/award.dto';
import { getOrSetAnonymousId } from '../../common/cookies/anonymous-id.util';

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
      const anonymousId = actorId ? undefined : getOrSetAnonymousId(req, res);

      const dedupIdentifier = actorId ?? anonymousId;

      void this.eventsService
        .recordEvent({
          eventType: EventType.PROFILE_VIEWED,
          profileId: profileId || undefined,
          actorId: actorId ?? undefined,
          anonymousId,
          dedupKey: dedupIdentifier
            ? `event-dedup:PROFILE_VIEWED:${profileId}:${dedupIdentifier}`
            : undefined,
        })
        .catch((err) =>
          this.logger?.warn(`Failed to record PROFILE_VIEWED event: ${err}`),
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

  @Post('me/skills')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Add a skill to the authenticated profile' })
  @ApiResponse({ status: 201, description: 'Skill created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async createSkill(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Body() dto: CreateSkillDto,
  ): Promise<Skill> {
    return this.profileService.createSkill(userId, dto);
  }

  @Get('me/skills')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all skills on the authenticated profile' })
  @ApiResponse({ status: 200, description: 'Skills returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async listSkills(
    @currentUserDecorator.CurrentUser('sub') userId: string,
  ): Promise<Skill[]> {
    return this.profileService.listSkills(userId);
  }

  @Patch('me/skills/:skillId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update a skill on the authenticated profile' })
  @ApiParam({ name: 'skillId', description: 'UUID of the skill' })
  @ApiResponse({ status: 200, description: 'Skill updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({
    status: 403,
    description: 'Skill does not belong to the authenticated user',
  })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async updateSkill(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Param('skillId', new ParseUUIDPipe()) skillId: string,
    @Body() dto: UpdateSkillDto,
  ): Promise<Skill> {
    return this.profileService.updateSkill(userId, skillId, dto);
  }

  @Delete('me/skills/:skillId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a skill from the authenticated profile' })
  @ApiParam({ name: 'skillId', description: 'UUID of the skill' })
  @ApiResponse({ status: 204, description: 'Skill deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({
    status: 403,
    description: 'Skill does not belong to the authenticated user',
  })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  async deleteSkill(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Param('skillId', new ParseUUIDPipe()) skillId: string,
  ): Promise<void> {
    return this.profileService.deleteSkill(userId, skillId);
  }

  @Put('me/skills/order')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Reorder all skills on the authenticated profile' })
  async reorderSkills(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Body() dto: ReorderSkillsDto,
  ): Promise<{ skills: Skill[] }> {
    const skills = await this.profileService.reorderSkills(userId, dto);
    return { skills };
  }

  @Post('me/education')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Add an education entry to the authenticated profile',
  })
  @ApiResponse({
    status: 201,
    description: 'Education entry created successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async createEducation(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Body() dto: CreateEducationDto,
  ): Promise<Education> {
    return this.profileService.createEducation(userId, dto);
  }

  @Get('me/education')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'List all education entries on the authenticated profile',
  })
  @ApiResponse({
    status: 200,
    description: 'Education entries returned successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async listEducation(
    @currentUserDecorator.CurrentUser('sub') userId: string,
  ): Promise<Education[]> {
    return this.profileService.listEducation(userId);
  }

  @Patch('me/education/:educationId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Update an education entry on the authenticated profile',
  })
  @ApiParam({ name: 'educationId', description: 'UUID of the education entry' })
  @ApiResponse({
    status: 200,
    description: 'Education entry updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({
    status: 403,
    description: 'Education entry does not belong to the authenticated user',
  })
  @ApiResponse({ status: 404, description: 'Education entry not found' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async updateEducation(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Param('educationId', new ParseUUIDPipe()) educationId: string,
    @Body() dto: UpdateEducationDto,
  ): Promise<Education> {
    return this.profileService.updateEducation(userId, educationId, dto);
  }

  @Delete('me/education/:educationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Delete an education entry from the authenticated profile',
  })
  @ApiParam({ name: 'educationId', description: 'UUID of the education entry' })
  @ApiResponse({
    status: 204,
    description: 'Education entry deleted successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({
    status: 403,
    description: 'Education entry does not belong to the authenticated user',
  })
  @ApiResponse({ status: 404, description: 'Education entry not found' })
  async deleteEducation(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Param('educationId', new ParseUUIDPipe()) educationId: string,
  ): Promise<void> {
    return this.profileService.deleteEducation(userId, educationId);
  }

  @Put('me/education/order')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Reorder all education entries on the authenticated profile',
  })
  async reorderEducation(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Body() dto: ReorderEducationDto,
  ): Promise<{ education: Education[] }> {
    const education = await this.profileService.reorderEducation(userId, dto);
    return { education };
  }

  @Post('me/work-experience')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Add a work experience entry to the authenticated profile',
  })
  @ApiResponse({
    status: 201,
    description: 'Work experience created successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async createWorkExperience(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Body() dto: CreateWorkExperienceDto,
  ): Promise<WorkExperience> {
    return this.profileService.createWorkExperience(userId, dto);
  }

  @Get('me/work-experience')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'List all work experience entries on the authenticated profile',
  })
  @ApiResponse({
    status: 200,
    description: 'Work experience entries returned successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async listWorkExperience(
    @currentUserDecorator.CurrentUser('sub') userId: string,
  ): Promise<WorkExperience[]> {
    return this.profileService.listWorkExperience(userId);
  }

  @Patch('me/work-experience/:workExperienceId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Update a work experience entry on the authenticated profile',
  })
  @ApiParam({
    name: 'workExperienceId',
    description: 'UUID of the work experience entry',
  })
  @ApiResponse({
    status: 200,
    description: 'Work experience updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({
    status: 403,
    description: 'Work experience does not belong to the authenticated user',
  })
  @ApiResponse({ status: 404, description: 'Work experience not found' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async updateWorkExperience(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Param('workExperienceId', new ParseUUIDPipe()) workExperienceId: string,
    @Body() dto: UpdateWorkExperienceDto,
  ): Promise<WorkExperience> {
    return this.profileService.updateWorkExperience(
      userId,
      workExperienceId,
      dto,
    );
  }

  @Delete('me/work-experience/:workExperienceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Delete a work experience entry from the authenticated profile',
  })
  @ApiParam({
    name: 'workExperienceId',
    description: 'UUID of the work experience entry',
  })
  @ApiResponse({
    status: 204,
    description: 'Work experience deleted successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({
    status: 403,
    description: 'Work experience does not belong to the authenticated user',
  })
  @ApiResponse({ status: 404, description: 'Work experience not found' })
  async deleteWorkExperience(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Param('workExperienceId', new ParseUUIDPipe()) workExperienceId: string,
  ): Promise<void> {
    return this.profileService.deleteWorkExperience(userId, workExperienceId);
  }

  @Put('me/work-experience/order')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Reorder all work experience entries on the authenticated profile',
  })
  async reorderWorkExperience(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Body() dto: ReorderWorkExperienceDto,
  ): Promise<{ workExperience: WorkExperience[] }> {
    const workExperience = await this.profileService.reorderWorkExperience(
      userId,
      dto,
    );
    return { workExperience };
  }

  @Post('me/awards')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Add an award to the authenticated profile' })
  @ApiResponse({ status: 201, description: 'Award created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async createAward(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Body() dto: CreateAwardDto,
  ): Promise<Award> {
    return this.profileService.createAward(userId, dto);
  }

  @Get('me/awards')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all awards on the authenticated profile' })
  @ApiResponse({ status: 200, description: 'Awards returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async listAwards(
    @currentUserDecorator.CurrentUser('sub') userId: string,
  ): Promise<Award[]> {
    return this.profileService.listAwards(userId);
  }

  @Patch('me/awards/:awardId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update an award on the authenticated profile' })
  @ApiParam({ name: 'awardId', description: 'UUID of the award' })
  @ApiResponse({ status: 200, description: 'Award updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({
    status: 403,
    description: 'Award does not belong to the authenticated user',
  })
  @ApiResponse({ status: 404, description: 'Award not found' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async updateAward(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Param('awardId', new ParseUUIDPipe()) awardId: string,
    @Body() dto: UpdateAwardDto,
  ): Promise<Award> {
    return this.profileService.updateAward(userId, awardId, dto);
  }

  @Delete('me/awards/:awardId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete an award from the authenticated profile' })
  @ApiParam({ name: 'awardId', description: 'UUID of the award' })
  @ApiResponse({ status: 204, description: 'Award deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({
    status: 403,
    description: 'Award does not belong to the authenticated user',
  })
  @ApiResponse({ status: 404, description: 'Award not found' })
  async deleteAward(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Param('awardId', new ParseUUIDPipe()) awardId: string,
  ): Promise<void> {
    return this.profileService.deleteAward(userId, awardId);
  }

  @Put('me/awards/order')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Reorder all awards on the authenticated profile' })
  async reorderAwards(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Body() dto: ReorderAwardsDto,
  ): Promise<{ awards: Award[] }> {
    const awards = await this.profileService.reorderAwards(userId, dto);
    return { awards };
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
