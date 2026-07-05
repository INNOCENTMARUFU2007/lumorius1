import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards, Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('tasks')
  @ApiOperation({ summary: 'Create a task' })
  createTask(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.tasksService.create(user.organizationId, user.sub, body as Parameters<TasksService['create']>[2]);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'List tasks' })
  findTasks(@CurrentUser() user: JwtPayload, @Query() query: Record<string, string>) {
    return this.tasksService.findAll(user.organizationId, query as Parameters<TasksService['findAll']>[1]);
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: 'Get task by ID' })
  findTask(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tasksService.findById(id, user.organizationId);
  }

  @Patch('tasks/:id')
  @ApiOperation({ summary: 'Update a task' })
  updateTask(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.tasksService.update(id, user.organizationId, body as Parameters<TasksService['update']>[2]);
  }

  @Delete('tasks/:id')
  @ApiOperation({ summary: 'Delete a task' })
  deleteTask(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tasksService.delete(id, user.organizationId);
  }

  @Get('projects')
  @ApiOperation({ summary: 'List projects' })
  findProjects(@CurrentUser() user: JwtPayload) {
    return this.tasksService.findProjects(user.organizationId);
  }

  @Post('projects')
  @ApiOperation({ summary: 'Create a project' })
  createProject(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.tasksService.createProject(user.organizationId, user.sub, body as Parameters<TasksService['createProject']>[2]);
  }

  @Get('projects/:id')
  @ApiOperation({ summary: 'Get project by ID' })
  findProject(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tasksService.findProjectById(id, user.organizationId);
  }
}
