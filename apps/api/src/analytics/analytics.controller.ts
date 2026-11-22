import { RequiresModule } from '../billing/entitlements';
import { Controller, Get, Post, Body, Param, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MarketingAnalyticsService } from './marketing-analytics.service';
import { AnalyticsService } from './analytics.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@RequiresModule('core')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService, private readonly marketing: MarketingAnalyticsService) {}

  @Get('marketing')
  @Roles('admin')
  marketingDashboard(@CurrentUser() user:JwtPayload,@Query('days') days?:string, @Query('view') view?:string,
    @Query('currency') currency?:string, @Query('segment') segment?:string) {
    return view === 'dashboard'
      ? this.marketing.overview(user.organizationId,Number(days),currency,segment)
      : this.marketing.dashboard(user.organizationId,Number(days));
  }

  @Get('founder-dashboard')
  @ApiOperation({ summary: 'Founder OS — AI-powered daily focus dashboard' })
  getFounderDashboard(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    const requestedDays = Number(days);
    const rangeDays = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
    return this.analyticsService.getFounderDashboard(user.organizationId, user.sub, rangeDays, false);
  }

  @Get('my-ai-usage')
  @ApiOperation({ summary: 'Get the signed-in user’s recorded AI usage this month' })
  getMyAiUsage(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getMyAiUsage(user.organizationId, user.sub);
  }

  @Get('team-dashboard')
  @ApiOperation({ summary: 'Team productivity dashboard' })
  getTeamDashboard(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getTeamDashboard(user.organizationId);
  }

  @Get('kpis')
  @ApiOperation({ summary: 'Get all KPI metrics' })
  getKpis(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getKpiMetrics(user.organizationId);
  }

  @Post('kpis')
  @Roles('manager')
  @ApiOperation({ summary: 'Create a KPI metric' })
  createKpi(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.analyticsService.createKpiMetric(user.organizationId, user.sub, body as Parameters<AnalyticsService['createKpiMetric']>[2]);
  }

  @Post('kpis/:id/values')
  @Roles('member')
  @ApiOperation({ summary: 'Record a KPI value' })
  recordKpiValue(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { value: number; date?: string },
  ) {
    return this.analyticsService.recordKpiValue(id, user.organizationId, body.value, body.date);
  }

  @Get('goals')
  @ApiOperation({ summary: 'Get organization goals' })
  getGoals(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getGoals(user.organizationId);
  }

  @Post('goals')
  @ApiOperation({ summary: 'Create a goal' })
  createGoal(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.analyticsService.createGoal(user.organizationId, user.sub, body as Parameters<AnalyticsService['createGoal']>[2]);
  }

  @Post('reports/weekly')
  @Roles('manager')
  @ApiOperation({ summary: 'Generate AI-powered weekly report' })
  generateWeeklyReport(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.generateWeeklyReport(user.organizationId, user.sub);
  }
}
