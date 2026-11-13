import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { LuieChangeFeedService } from './luie-change-feed.service';

@ApiTags('luie')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('luie')
export class LuieChangeFeedController {
  constructor(private readonly changeFeed: LuieChangeFeedService) {}

  @Get('changes')
  @ApiOperation({ summary: 'Get visible committed intelligence changes for dashboard refresh' })
  getChanges(
    @CurrentUser() user: JwtPayload,
    @Query('since') since?: string,
    @Query('afterId') afterId?: string,
  ) {
    return this.changeFeed.getChanges(
      user.organizationId,
      user.sub,
      user.role,
      since,
      afterId,
    );
  }
}
