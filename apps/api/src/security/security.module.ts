import { Module } from '@nestjs/common';
import { SecurityService } from './security.service';
import { SecurityController } from './security.controller';
import { PublicApiController, PublicApiRateLimitGuard, PublicApiScopeGuard } from './public-api.controller';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../common/email/email.module';

@Module({
  imports: [DatabaseModule, EmailModule],
  controllers: [SecurityController, PublicApiController],
  providers: [SecurityService, ApiKeyGuard, PublicApiRateLimitGuard, PublicApiScopeGuard],
  exports: [SecurityService],
})
export class SecurityModule {}
