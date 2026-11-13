import { Module, Global, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiFinancialService } from './ai-financial.service';
import { AiController } from './ai.controller';
import { AiQuotaGuard } from './guards/ai-quota.guard';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../common/redis/redis.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Global()
@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, forwardRef(() => KnowledgeModule)],
  providers: [AiService, AiQuotaGuard, AiFinancialService],
  controllers: [AiController],
  exports: [AiService, AiQuotaGuard, AiFinancialService],
})
export class AiModule {}
