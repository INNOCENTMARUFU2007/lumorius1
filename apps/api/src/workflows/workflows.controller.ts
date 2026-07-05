import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WorkflowsService } from './workflows.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('workflows')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  @Roles('manager')
  @ApiOperation({ summary: 'Create a workflow' })
  create(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.workflowsService.create(user.organizationId, user.sub, body as Parameters<WorkflowsService['create']>[2]);
  }

  @Get()
  @ApiOperation({ summary: 'List workflows' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.workflowsService.findAll(user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow by ID' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.workflowsService.findById(id, user.organizationId);
  }

  @Patch(':id/toggle')
  @Roles('manager')
  @ApiOperation({ summary: 'Toggle workflow active/inactive' })
  toggle(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.workflowsService.toggle(id, user.organizationId);
  }

  @Post(':id/trigger')
  @ApiOperation({ summary: 'Manually trigger a workflow' })
  trigger(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workflowsService.trigger(id, user.organizationId, body);
  }

  @Get(':id/runs')
  @ApiOperation({ summary: 'Get workflow run history' })
  getRuns(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.workflowsService.getRuns(id, user.organizationId);
  }
}
