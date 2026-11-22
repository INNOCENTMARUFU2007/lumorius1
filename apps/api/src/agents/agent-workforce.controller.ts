import { RequiresModule } from '../billing/entitlements';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AGENTS, Agent, Intent } from './agent-contract';
import { MARKETS } from '../workspace/market-research.service';
import { AgentRunsService } from './agent-runs.service';
import { AgentApprovalService } from './agent-approval.service';

class MissionDto {
  @IsIn(AGENTS.map(agent=>agent.id)) agent!: Agent;
  @IsIn(['briefing','goals','analysis','marketing']) intent!: Intent;
  @IsOptional() @IsIn(Object.keys(MARKETS)) marketCountry?: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(8,2000) mission!: string;
  @IsUUID() idempotencyKey!: string;
}
class VersionDto { @IsInt() @Min(1) version!: number; }

@RequiresModule('core')
@Controller('agents')
@UseGuards(AuthGuard('jwt'),RolesGuard)
@Roles('manager')
export class AgentWorkforceController {
  constructor(private readonly runs: AgentRunsService, private readonly approval: AgentApprovalService) {}
  @Get()
  catalog(@CurrentUser() actor: JwtPayload) { return this.runs.catalog(actor); }
  @Get('metrics')
  metrics(@CurrentUser() actor:JwtPayload) { return this.runs.metrics(actor); }
  @Get('runs')
  list(@CurrentUser() actor: JwtPayload,@Query('agent') agent?: Agent,@Query('status') status?: string,@Query('cursor') cursor?: string) {
    return this.runs.list(actor,agent,status,cursor);
  }
  @Post('runs')
  start(@CurrentUser() actor: JwtPayload,@Body() dto: MissionDto) { return this.runs.start(actor,dto.agent,dto.intent,dto.mission,dto.idempotencyKey,dto.marketCountry); }
  @Get('runs/:id')
  read(@CurrentUser() actor: JwtPayload,@Param('id',ParseUUIDPipe) id: string) { return this.runs.detail(actor,id); }
  @Post('runs/:id/cancel')
  cancel(@CurrentUser() actor: JwtPayload,@Param('id',ParseUUIDPipe) id: string) { return this.runs.cancel(actor,id); }
  @Post('runs/:id/submit')
  submit(@CurrentUser() actor: JwtPayload,@Param('id',ParseUUIDPipe) id: string,@Body() dto: VersionDto) { return this.approval.submit(actor,id,dto.version); }
  @Post('runs/:id/review')
  review(@CurrentUser() actor: JwtPayload,@Param('id',ParseUUIDPipe) id: string) { return this.approval.review(actor,id); }
  @Post('runs/:id/apply')
  apply(@CurrentUser() actor: JwtPayload,@Param('id',ParseUUIDPipe) id: string,@Body() dto: VersionDto) { return this.approval.apply(actor,id,dto.version); }
}
