import {
  Controller, Get, Put, Patch, Delete, Body, Param,
  UseGuards, Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('manager')
  @ApiOperation({ summary: 'List all users in organization' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.usersService.findAll(user.organizationId, { search, page, pageSize });
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.findById(user.sub, user.organizationId);
  }

  @Put('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name?: string; avatarUrl?: string },
  ) {
    return this.usersService.updateProfile(user.sub, user.organizationId, body);
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Change current user password' })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.usersService.changePassword(user.sub, body.currentPassword, body.newPassword);
  }

  @Get(':id')
  @Roles('manager')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.usersService.findById(id, user.organizationId);
  }

  @Patch(':id/role')
  @Roles('admin')
  @ApiOperation({ summary: 'Update user role' })
  updateRole(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { role: string },
  ) {
    return this.usersService.updateRole(id, user.organizationId, body.role, user.sub);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Deactivate a user' })
  deactivate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.usersService.deactivate(id, user.organizationId, user.sub);
  }
}
