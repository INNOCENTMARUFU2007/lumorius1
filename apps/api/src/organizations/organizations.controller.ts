import { Controller, Get, Put, Post, Param, Body, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current organization' })
  getMyOrg(@CurrentUser() user: JwtPayload) {
    return this.orgsService.findById(user.organizationId);
  }

  @Put('me')
  @Roles('admin')
  @ApiOperation({ summary: 'Update organization settings' })
  update(@CurrentUser() user: JwtPayload, @Body() body: { name?: string; settings?: Record<string, unknown> }) {
    return this.orgsService.update(user.organizationId, body);
  }

  @Get('me/usage')
  @ApiOperation({ summary: 'Get usage stats for current organization' })
  getUsage(@CurrentUser() user: JwtPayload) {
    return this.orgsService.getUsage(user.organizationId);
  }

  @Get('me/teams')
  @ApiOperation({ summary: 'List teams in organization' })
  getTeams(@CurrentUser() user: JwtPayload) {
    return this.orgsService.getTeams(user.organizationId);
  }

  @Post('me/teams')
  @Roles('manager')
  @ApiOperation({ summary: 'Create a team' })
  createTeam(@CurrentUser() user: JwtPayload, @Body() body: { name: string; description?: string; departmentId?: string }) {
    return this.orgsService.createTeam(user.organizationId, user.sub, body);
  }

  @Post('me/teams/:teamId/members')
  @Roles('manager')
  @ApiOperation({ summary: 'Add member to team' })
  addTeamMember(
    @CurrentUser() user: JwtPayload,
    @Param('teamId') teamId: string,
    @Body() body: { userId: string; role?: string },
  ) {
    return this.orgsService.addTeamMember(teamId, user.organizationId, body.userId, body.role);
  }

  @Get('me/departments')
  @ApiOperation({ summary: 'List departments' })
  getDepartments(@CurrentUser() user: JwtPayload) {
    return this.orgsService.getDepartments(user.organizationId);
  }

  @Post('me/departments')
  @Roles('admin')
  @ApiOperation({ summary: 'Create a department' })
  createDepartment(@CurrentUser() user: JwtPayload, @Body() body: { name: string; description?: string; headUserId?: string }) {
    return this.orgsService.createDepartment(user.organizationId, body);
  }

  @Post('me/invite')
  @Roles('manager')
  @ApiOperation({ summary: 'Invite a user to the organization' })
  invite(@CurrentUser() user: JwtPayload, @Body() body: { email: string; role: string; teamId?: string }) {
    return this.orgsService.invite(user.organizationId, user.sub, body);
  }

  @Post('accept-invite')
  @ApiOperation({ summary: 'Accept an organization invitation' })
  acceptInvite(@CurrentUser() user: JwtPayload, @Body() body: { token: string }) {
    return this.orgsService.acceptInvitation(body.token, user.sub);
  }
}
