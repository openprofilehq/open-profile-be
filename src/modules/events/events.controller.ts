import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { Public } from '../../common/decorators/public.decorator';
import { RecordLinkClickDto } from './dto/record-link-click.dto';
import { EventType } from './entities/event.entity';
import { Request } from 'express';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Public()
  @Post('link-click')
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordLinkClick(
    @Body() dto: RecordLinkClickDto,
    @Req() req: Request & { user?: { sub: string } },
  ): Promise<void> {
    const actorId = req.user?.sub ?? undefined;

    const isValid = await this.eventsService.isValidProfileLink(
      dto.profileId,
      dto.linkUrl,
    );

    if (!isValid) return;

    await this.eventsService.recordEvent({
      eventType: EventType.LINK_CLICKED,
      profileId: dto.profileId,
      actorId,
      metadata: { linkUrl: dto.linkUrl },
    });
  }
}
