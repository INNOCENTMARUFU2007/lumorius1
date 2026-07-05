import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FounderOsService } from './founder-os.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import {
  IsString, IsOptional, IsNumber, IsInt, Min, Max,
  IsIn, IsDateString, IsUUID,
} from 'class-validator';

class CreateObjectiveDto {
  @IsString() title: string = '';
  @IsOptional() @IsString() description?: string;
  @IsString() quarter: string = 'Q1';
  @IsInt() @Min(2020) @Max(2050) year: number = new Date().getFullYear();
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsUUID() ownerId?: string;
}

class UpdateObjectiveDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(['on_track', 'at_risk', 'behind', 'completed']) status?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) progress?: number;
}

class AddKeyResultDto {
  @IsString() title: string = '';
  @IsOptional() @IsIn(['percentage', 'number', 'currency', 'boolean']) metricType?: string;
  @IsNumber() @Min(0) targetValue: number = 100;
  @IsOptional() @IsNumber() startValue?: number;
  @IsOptional() @IsString() unit?: string;
}

class UpdateKeyResultDto {
  @IsNumber() currentValue: number = 0;
}

class RecordKpiDto {
  @IsString() metricKey: string = '';
  @IsNumber() value: number = 0;
}

@ApiTags('founder-os')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('founder-os')
export class FounderOsController {
  constructor(private readonly founderOsService: FounderOsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Full Founder OS dashboard' })
  async dashboard(@CurrentUser() user: JwtPayload) {
    return this.founderOsService.getDashboard(user.organizationId!, user.sub);
  }

  @Get('health-score')
  @ApiOperation({ summary: 'Compute current business health score' })
  async healthScore(@CurrentUser() user: JwtPayload) {
    return this.founderOsService.computeHealthScore(user.organizationId!);
  }

  @Get('health-score/history')
  @ApiOperation({ summary: 'Historical health score trend' })
  async healthScoreHistory(@CurrentUser() user: JwtPayload, @Query('limit') limit?: number) {
    return this.founderOsService.getHealthScoreHistory(user.organizationId!, limit ?? 30);
  }

  // ── OKRs ────────────────────────────────────────────────────

  @Get('okrs')
  @ApiOperation({ summary: 'Get OKRs for a quarter' })
  async getOkrs(
    @CurrentUser() user: JwtPayload,
    @Query('quarter') quarter?: string,
    @Query('year') year?: number,
  ) {
    return this.founderOsService.getOkrs(user.organizationId!, quarter, year ? Number(year) : undefined);
  }

  @Post('okrs')
  @ApiOperation({ summary: 'Create a new objective' })
  async createObjective(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateObjectiveDto,
  ) {
    return this.founderOsService.createObjective(user.organizationId!, user.sub, dto);
  }

  @Patch('okrs/:id')
  @ApiOperation({ summary: 'Update an objective' })
  async updateObjective(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateObjectiveDto,
  ) {
    return this.founderOsService.updateObjective(user.organizationId!, id, dto);
  }

  @Post('okrs/:id/key-results')
  @ApiOperation({ summary: 'Add a key result to an objective' })
  async addKeyResult(
    @Param('id') objectiveId: string,
    @Body() dto: AddKeyResultDto,
  ) {
    return this.founderOsService.addKeyResult(objectiveId, dto);
  }

  @Patch('okrs/key-results/:id')
  @ApiOperation({ summary: 'Update a key result\'s current value' })
  async updateKeyResult(
    @Param('id') krId: string,
    @Body() dto: UpdateKeyResultDto,
  ) {
    return this.founderOsService.updateKeyResult(krId, dto.currentValue);
  }

  // ── KPIs ─────────────────────────────────────────────────────

  @Get('kpis')
  @ApiOperation({ summary: 'Get all KPI snapshots (last 30 days by default)' })
  async kpis(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: number,
  ) {
    return this.founderOsService.getAllKpiSnapshots(user.organizationId!, days ? Number(days) : 30);
  }

  @Get('kpis/:key/timeseries')
  @ApiOperation({ summary: 'Time-series data for a specific KPI' })
  async kpiTimeseries(
    @CurrentUser() user: JwtPayload,
    @Param('key') key: string,
    @Query('days') days?: number,
  ) {
    return this.founderOsService.getKpiTimeseries(user.organizationId!, key, days ? Number(days) : 30);
  }

  @Post('kpis/record')
  @ApiOperation({ summary: 'Record a KPI value' })
  async recordKpi(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecordKpiDto,
  ) {
    return this.founderOsService.recordKpiSnapshot(user.organizationId!, dto.metricKey, dto.value);
  }

  // ── Usage ────────────────────────────────────────────────────

  @Get('usage')
  @ApiOperation({ summary: 'Usage summary for the organisation' })
  async usage(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: number,
  ) {
    return this.founderOsService.getUsageSummary(user.organizationId!, days ? Number(days) : 30);
  }
}
