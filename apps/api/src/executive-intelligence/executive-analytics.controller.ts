import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  UseGuards,
  StreamableFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ExecutiveAnalyticsService } from './executive-analytics.service';
import { ExecutivePdfService } from './executive-pdf.service';
import { RawApiResponse } from '../common/interceptors/transform.interceptor';

@ApiTags('executive-intelligence')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('executive-intelligence')
export class ExecutiveAnalyticsController {
  constructor(
    private readonly analytics: ExecutiveAnalyticsService,
    private readonly pdf: ExecutivePdfService,
  ) {}

  private actor(user: JwtPayload) {
    return {
      organizationId: user.organizationId,
      userId: user.sub,
      role: String(user.role ?? ''),
    };
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get governed Executive Intelligence KPIs, targets and alerts' })
  getDashboard(
    @CurrentUser() user: JwtPayload,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analytics.getDashboard(this.actor(user), startDate, endDate);
  }

  @Get('reports')
  @ApiOperation({ summary: 'Get the canonical Executive Intelligence report data' })
  getReport(
    @CurrentUser() user: JwtPayload,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analytics.getReport(this.actor(user), startDate, endDate);
  }

  @RawApiResponse()
  @Get('reports/pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="lumorius-executive-report.pdf"')
  @ApiOperation({ summary: 'Download the canonical Executive Intelligence report as PDF' })
  async exportPdf(
    @CurrentUser() user: JwtPayload,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<StreamableFile> {
    const report = await this.analytics.getReport(this.actor(user), startDate, endDate);
    const buffer = await this.pdf.generate(report);
return new StreamableFile(buffer, {
  type: 'application/pdf',
  disposition: 'attachment; filename=lumorius-executive-report.pdf',
  length: buffer.length,
});
  }

  @RawApiResponse()
  @Get('reports/xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="lumorius-executive-report.xlsx"')
  @ApiOperation({ summary: 'Download Executive Intelligence KPIs and provenance as XLSX' })
  async exportXlsx(
    @CurrentUser() user: JwtPayload,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<StreamableFile> {
    const report = await this.analytics.getReport(this.actor(user), startDate, endDate);
    const buffer = this.analytics.exportXlsx(report);
return new StreamableFile(buffer, {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  disposition: 'attachment; filename=lumorius-executive-report.xlsx',
  length: buffer.length,
});
  }

  @RawApiResponse()
  @Get('reports/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="lumorius-executive-report.csv"')
  @ApiOperation({ summary: 'Download Executive Intelligence KPI data as CSV' })
  async exportCsv(
    @CurrentUser() user: JwtPayload,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<string> {
    const report = await this.analytics.getReport(this.actor(user), startDate, endDate);
    return this.analytics.exportCsv(report);
  }

  @Get('targets')
  @ApiOperation({ summary: 'List organisation Executive Intelligence targets' })
  listTargets(@CurrentUser() user: JwtPayload) {
    return this.analytics.listTargets(this.actor(user));
  }

  @Post('targets')
  @ApiOperation({ summary: 'Create an organisation Executive Intelligence KPI target' })
  createTarget(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.analytics.createTarget(body, this.actor(user));
  }
}