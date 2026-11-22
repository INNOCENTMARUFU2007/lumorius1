import { CashForecastService } from './cash-forecast.service';
import { FinancialDigestService } from './financial-digest.service';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ExecutivePdfModule } from './executive-pdf.module';
import { ExecutiveIntelligenceController } from './executive-intelligence.controller';
import { ExecutiveImportService } from './executive-import.service';
import { ExecutiveAnalyticsController } from './executive-analytics.controller';
import { ExecutiveAnalyticsService } from './executive-analytics.service';
import { ExecutivePdfService } from './executive-pdf.service';
import { LuieModule } from '../luie/luie.module';

@Module({
  imports: [DatabaseModule, ExecutivePdfModule, LuieModule],
  controllers: [ExecutiveIntelligenceController, ExecutiveAnalyticsController],
  providers: [ExecutiveImportService, ExecutiveAnalyticsService, ExecutivePdfService, CashForecastService, FinancialDigestService],
  exports: [ExecutiveImportService, CashForecastService, FinancialDigestService, ExecutiveAnalyticsService],
})
export class ExecutiveIntelligenceModule {}