
import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get notifications for current user',
  })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const onlyUnread = unreadOnly?.toLowerCase() === 'true';

    return this.notificationsService.findAll(
      user.sub,
      onlyUnread,
    );
  }

  @Get('feed')
  @ApiOperation({ summary: 'List pages of notifications with unread totals' })
  feed(@CurrentUser() user: JwtPayload, @Query('unreadOnly') unreadOnly?: string, @Query('page') page?: string) {
    return this.notificationsService.feed(user.sub, user.organizationId, unreadOnly === 'true', page);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notification count',
  })
  getUnreadCount(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.getUnreadCount(user.sub);
  }

  @Patch('read-all')
  @ApiOperation({
    summary: 'Mark all notifications as read',
  })
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.markAllRead(user.sub);
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark notification as read',
  })
  markRead(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markRead(user.sub, id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a notification belonging to the current user',
  })
  delete(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.notificationsService.delete(user.sub, id);
  }
}
