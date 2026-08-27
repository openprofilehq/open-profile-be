import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { Public } from '../../common/decorators/public.decorator';
import { RecordLinkClickDto } from './dto/record-link-click.dto';
import { EventType } from './entities/event.entity';
import type { Request, Response } from 'express';
import { getOrSetAnonymousId } from '../../common/cookies/anonymous-id.util';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

@Controller('events')
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(private readonly eventsService: EventsService) {}
  @Public()
  @Post('link-click')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async recordLinkClick(
    @Body() dto: RecordLinkClickDto,
    @Req() req: Request & { user?: { sub: string } },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ recorded: boolean }> {
    const actorId = req.user?.sub ?? undefined;
    const anonymousId = !actorId ? getOrSetAnonymousId(req, res) : undefined;

    const { valid, profileId } = await this.eventsService.validateProfileLink(
      dto.username,
      dto.linkUrl,
    );

    if (!valid || !profileId) {
      this.logger.warn(
        `Rejected link-click: linkUrl not found on profile. username=${dto.username} linkUrl=${dto.linkUrl}`,
      );
      return { recorded: false };
    }

    await this.eventsService.recordEvent({
      eventType: EventType.LINK_CLICKED,
      profileId,
      actorId,
      anonymousId,
      metadata: { linkUrl: dto.linkUrl },
      dedupKey: `link-click:${profileId}:${dto.linkUrl}:${actorId ?? anonymousId ?? 'anon'}`,
    });

    return { recorded: true };
  }
}
