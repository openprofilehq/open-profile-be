import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiParam,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { InvitesService } from './invites.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CreateInviteDto } from './dto/create-invite.dto';
import { CreateInviteResponseDto } from './dto/create-invite-response.dto';
import { InviteLookupResponseDto } from './dto/invite-lookup-response.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

interface AuthRequest extends Request {
  user: AuthenticatedUser;
}

@ApiTags('Invites')
@Controller('invites')
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Generate and send an invite to a recipient email' })
  @ApiCreatedResponse({ type: CreateInviteResponseDto })
  async createInvite(
    @Req() req: AuthRequest,
    @Body() dto: CreateInviteDto,
  ): Promise<CreateInviteResponseDto> {
    return this.invitesService.createInvite(req.user.sub, dto);
  }

  @Public()
  @Get(':token')
  @ApiOperation({
    summary:
      'Look up an invite by token — validates it and records the first click',
  })
  @ApiParam({
    name: 'token',
    description: 'The invite token from the signup URL',
  })
  @ApiOkResponse({ type: InviteLookupResponseDto })
  async getInvite(
    @Param('token') token: string,
  ): Promise<InviteLookupResponseDto> {
    return this.invitesService.recordInviteClick(token);
  }

  @Post(':token/claim')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Claim an invite as the authenticated user',
  })
  @ApiParam({
    name: 'token',
    description: 'The invite token from the signup URL',
  })
  async claimInvite(
    @Req() req: AuthRequest,
    @Param('token') token: string,
  ): Promise<void> {
    return this.invitesService.claimInvite(token, req.user.sub, req.user.email);
  }
}
