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
} from '@nestjs/swagger';
import type { Request } from 'express';
import { InvitesService } from './invites.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CreateInviteDto } from './dto/create-invite.dto';
import { CreateInviteResponseDto } from './dto/create-invite-response.dto';
import { InviteLookupResponseDto } from './dto/invite-lookup-response.dto';

interface AuthRequest extends Request {
  user: {
    sub: string;
  };
}

@ApiTags('Invites')
@Controller('invites')
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Generate and send an invite to a recipient email' })
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
  async getInvite(
    @Param('token') token: string,
  ): Promise<InviteLookupResponseDto> {
    return this.invitesService.recordInviteClick(token);
  }
}
