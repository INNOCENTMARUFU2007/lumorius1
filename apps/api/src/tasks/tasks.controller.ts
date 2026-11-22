import { RequiresModule } from '../billing/entitlements';
import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('member')
@RequiresModule('core')
@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('tasks')
  @ApiOperation({ summary: 'Create a task' })
  createTask(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.tasksService.create(
      user.organizationId,
      user.sub,
      body as Parameters<TasksService['create']>[2],
      { userId: user.sub, role: user.role },
    );
  }

  @Get('tasks')
  @ApiOperation({ summary: 'List tasks' })
  findTasks(@CurrentUser() user: JwtPayload, @Query() query: Record<string, string>) {
    return this.tasksService.findAll(
      user.organizationId,
      query as Parameters<TasksService['findAll']>[1],
      { userId: user.sub, role: user.role },
    );
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: 'Get task by ID' })
  findTask(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tasksService.findById(id, user.organizationId, { userId: user.sub, role: user.role });
  }

  @Patch('tasks/:id')
  @ApiOperation({ summary: 'Update a task' })
  updateTask(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.tasksService.update(
      id,
      user.organizationId,
      body as Parameters<TasksService['update']>[2],
      { userId: user.sub, role: user.role },
    );
  }

  @Delete('tasks/:id')
  @ApiOperation({ summary: 'Delete a task' })
  deleteTask(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tasksService.delete(id, user.organizationId, { userId: user.sub, role: user.role });
  }

  @Get('projects')
  @ApiOperation({ summary: 'List projects' })
  findProjects(@CurrentUser() user: JwtPayload) {
    return this.tasksService.findProjects(user.organizationId, { userId: user.sub, role: user.role });
  }

  @Get('projects/teams')
  @Roles('manager')
  @ApiOperation({ summary: 'List teams the signed-in manager can select for a project' })
  findProjectTeams(@CurrentUser() user: JwtPayload) {
    return this.tasksService.findProjectTeams(user.organizationId, { userId: user.sub, role: user.role });
  }

  @Post('projects')
  @Roles('manager')
  @ApiOperation({ summary: 'Create a project' })
  createProject(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.tasksService.createProject(
      user.organizationId,
      user.sub,
      body as Parameters<TasksService['createProject']>[2],
      { userId: user.sub, role: user.role },
    );
  }

  @Patch('projects/:id')
  @Roles('manager')
  @ApiOperation({ summary: 'Update a project' })
  updateProject(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.tasksService.updateProject(
      id,
      user.organizationId,
      body as Parameters<TasksService['updateProject']>[2],
      { userId: user.sub, role: user.role },
    );
  }

  @Get('projects/:id')
  @ApiOperation({ summary: 'Get project by ID' })
  findProject(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tasksService.findProjectById(id, user.organizationId, { userId: user.sub, role: user.role });
  }
}
