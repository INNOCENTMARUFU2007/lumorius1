import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiQuotaGuard } from './guards/ai-quota.guard';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../common/redis/redis.module';

@Global()
@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule],
  providers: [AiService, AiQuotaGuard],
  controllers: [AiController],
  exports: [AiService, AiQuotaGuard],
})
export class AiModule {}
