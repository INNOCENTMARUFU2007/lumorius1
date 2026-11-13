import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { AiFinancialService } from '../ai/ai-financial.service';
import type { CreateAiPricingInput } from '../ai/ai-financial.service';
import { PlatformOwnerGuard } from './platform-owner.guard';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PlatformOwnerGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly aiFinancialService: AiFinancialService,
  ) {}

  // ── Platform Stats ───────────────────────────────────────────

  @Get('stats')
  @ApiOperation({
    summary: 'Platform-wide stats (MRR, users, orgs)',
  })
  getStats() {
    return this.adminService.getPlatformStats();
  }

  // ── Users ────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({
    summary: 'List all users (paginated)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
  })
  @ApiQuery({
    name: 'search',
    required: false,
  })
  listUsers(
    @Query('limit') limit = '25',
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.adminService.listUsersCursor(search, cursor, Number(limit));
  }

  @Get('users/:id')
  @ApiOperation({
    summary: 'Get user detail',
  })
  getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id/suspend')
  @ApiOperation({
    summary: 'Suspend user account',
  })
  @HttpCode(HttpStatus.OK)
  suspendUser(
    @Param('id') id: string,
    @CurrentUser() admin: { id: string },
  ) {
    return this.adminService.suspendUser(id, admin.id);
  }

  @Patch('users/:id/reinstate')
  @ApiOperation({
    summary: 'Reinstate suspended user',
  })
  @HttpCode(HttpStatus.OK)
  reinstateUser(
    @Param('id') id: string,
    @CurrentUser() admin: { id: string },
  ) {
    return this.adminService.reinstateUser(id, admin.id);
  }

  @Delete('users/:id')
  @ApiOperation({
    summary: 'Permanently delete user',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(
    @Param('id') id: string,
    @CurrentUser() admin: { id: string },
  ) {
    return this.adminService.deleteUser(id, admin.id);
  }

  // ── Organisations ────────────────────────────────────────────

  @Get('organizations')
  @ApiOperation({
    summary: 'List all organisations',
  })
  @ApiQuery({
    name: 'page',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
  })
  @ApiQuery({
    name: 'search',
    required: false,
  })
  listOrgs(
    @Query('page') page = '1',
    @Query('limit') limit = '25',
    @Query('search') search?: string,
  ) {
    return this.adminService.listOrgs(
      Number(page),
      Number(limit),
      search,
    );
  }

  @Patch('organizations/:id/plan')
  @ApiOperation({
    summary: 'Override an org plan',
  })
  changePlan(
    @Param('id') id: string,
    @Body() body: { planId: string },
    @CurrentUser() admin: { id: string },
  ) {
    return this.adminService.changePlan(
      id,
      body.planId,
      admin.id,
    );
  }

  // ── Audit Logs ───────────────────────────────────────────────

  @Get('audit-logs')
  @ApiOperation({
    summary: 'Platform-wide audit log',
  })
  getAuditLogs(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.adminService.getAuditLogs(
      Number(page),
      Number(limit),
    );
  }
  // ── AI provider pricing registry ─────────────────────────────

  @Get('ai-pricing')
  @ApiOperation({ summary: 'List immutable, effective-dated AI provider pricing rates' })
  listAiPricing(
    @Query('provider') provider?: string,
    @Query('model') model?: string,
    @Query('operationType') operationType?: string,
  ) {
    return this.aiFinancialService.listPricing({ provider, model, operationType });
  }

  @Post('ai-pricing')
  @ApiOperation({ summary: 'Create a new effective-dated AI pricing version' })
  createAiPricing(
    @Body() body: CreateAiPricingInput,
    @CurrentUser() admin: { id: string },
  ) {
    return this.aiFinancialService.createPricing(body, admin?.id);
  }
}