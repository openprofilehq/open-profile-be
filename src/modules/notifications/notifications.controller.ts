import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import * as currentUserDecorator from '../../common/decorators/current-user.decorator';
import { NotificationService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  findAll(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationService.findAllForUser(
      userId,
      query.page,
      query.limit,
    );
  }

  @Get('unread-count')
  unreadCount(@currentUserDecorator.CurrentUser('sub') userId: string) {
    return this.notificationService.unreadCount(userId);
  }

  @Patch(':id/read')
  markAsRead(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationService.markAsRead(userId, id);
  }

  @Patch(':id/unread')
  markAsUnread(
    @currentUserDecorator.CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationService.markAsUnread(userId, id);
  }

  @Patch('read-all')
  markAllAsRead(@currentUserDecorator.CurrentUser('sub') userId: string) {
    return this.notificationService.markAllAsRead(userId);
  }
}
