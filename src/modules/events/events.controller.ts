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
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async recordLinkClick(
    @Body() dto: RecordLinkClickDto,
    @Req() req: Request & { user?: { sub: string } },
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const actorId = req.user?.sub ?? undefined;
    const anonymousId = !actorId ? getOrSetAnonymousId(req, res) : undefined;

    const isValid = await this.eventsService.isValidProfileLink(
      dto.profileId,
      dto.linkUrl,
    );

    if (!isValid) {
      this.logger.warn(
        `Rejected link-click: linkUrl not found on profile. profileId=${dto.profileId} linkUrl=${dto.linkUrl}`,
      );
      return;
    }

    await this.eventsService.recordEvent({
      eventType: EventType.LINK_CLICKED,
      profileId: dto.profileId,
      actorId,
      anonymousId,
      metadata: { linkUrl: dto.linkUrl },
      dedupKey: `link-click:${dto.profileId}:${dto.linkUrl}:${actorId ?? anonymousId ?? 'anon'}`,
    });
  }
}
