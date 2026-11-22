import { RequiresModule } from '../billing/entitlements';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn, IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { BRIEFING_ITEM_KEY } from './briefing-key';
import { WorkspaceService } from './workspace.service';

class ScheduleDto {
  @IsIn(['off', 'daily', 'weekly', 'monthly'])
  cadence!: 'off' | 'daily' | 'weekly' | 'monthly';

  @IsInt() @Min(0) @Max(23)
  hourUtc!: number;

  @IsInt() @Min(1) @Max(7)
  weekday!: number;
}

class BriefingItemDto {
  @IsString() @Matches(BRIEFING_ITEM_KEY, { message: 'Invalid briefing item.' })
  key!: string;
}

class WorkflowReviewDto {
  @IsIn(['approved', 'rejected'])
  outcome!: 'approved' | 'rejected';
}

class FeedbackDto extends BriefingItemDto {
  @IsIn(['dismissed', 'useful', 'reset'])
  disposition!: 'dismissed' | 'useful' | 'reset';
}

@RequiresModule('core')
@Controller('workspace/briefing')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('member')
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get()
  briefing(@CurrentUser() user: JwtPayload) {
    return this.workspace.briefing(user);
  }

  @Put('schedule')
  schedule(@CurrentUser() user: JwtPayload, @Body() body: ScheduleDto) {
    return this.workspace.setSchedule(user, body);
  }

  @Put('feedback')
  feedback(@CurrentUser() user: JwtPayload, @Body() body: FeedbackDto) {
    return this.workspace.feedback(user, body.key, body.disposition);
  }

  @Post('workflows/:id/request')
  requestWorkflow(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.workspace.requestWorkflow(user, id);
  }

  @Post('workflow-approvals/:id')
  @Roles('manager')
  reviewWorkflow(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WorkflowReviewDto,
  ) {
    return this.workspace.reviewWorkflow(user, id, body.outcome);
  }

  @Post('workflows/:id/run')
  @Roles('manager')
  startWorkflow(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.workspace.startWorkflow(user, id);
  }

  @Post('tasks')
  task(@CurrentUser() user: JwtPayload, @Body() body: BriefingItemDto) {
    return this.workspace.createTask(user, body.key);
  }
}
