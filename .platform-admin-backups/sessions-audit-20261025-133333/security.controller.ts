import {
  Controller, Get, Post, Delete, Body, Param, Query,
  UseGuards, Req, Ip,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { SecurityService } from './security.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { IsString, IsOptional, IsArray, IsDateString } from 'class-validator';

class CreateApiKeyDto {
  @IsString() name: string = '';
  @IsOptional() @IsArray() scopes?: string[];
  @IsOptional() @IsDateString() expiresAt?: string;
}

class AuditQueryDto {
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

@ApiTags('security')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('security')
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Security dashboard summary' })
  async summary(@CurrentUser() user: JwtPayload) {
    return this.securityService.getSecuritySummary(user.organizationId!);
  }

  @Get('audit-logs')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Get audit logs for the organisation' })
  async auditLogs(
    @CurrentUser() user: JwtPayload,
    @Query() query: AuditQueryDto,
  ) {
    return this.securityService.getAuditLogs(user.organizationId!, query);
  }

  @Post('api-keys')
  @ApiOperation({ summary: 'Create a new API key' })
  async createKey(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.securityService.createApiKey(user.organizationId!, user.sub, dto);
  }

  @Get('api-keys')
  @ApiOperation({ summary: 'List all active API keys' })
  async listKeys(@CurrentUser() user: JwtPayload) {
    return this.securityService.listApiKeys(user.organizationId!);
  }

  @Delete('api-keys/:id')
  @ApiOperation({ summary: 'Revoke an API key' })
  async revokeKey(
    @CurrentUser() user: JwtPayload,
    @Param('id') keyId: string,
  ) {
    return this.securityService.revokeApiKey(user.organizationId!, keyId, user.sub);
  }

  @Get('login-attempts')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Recent login attempts for the organisation' })
  async loginAttempts(@CurrentUser() user: JwtPayload) {
    return this.securityService.getLoginAttempts(user.organizationId!);
  }
}
