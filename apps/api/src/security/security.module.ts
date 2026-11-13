import { Module } from '@nestjs/common';
import { SecurityService } from './security.service';
import { SecurityController } from './security.controller';
import { PublicApiController, PublicApiRateLimitGuard, PublicApiScopeGuard } from './public-api.controller';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../common/email/email.module';
import { LuieModule } from '../luie/luie.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { LuieOperationsService } from './luie-operations.service';
import { LuieOperationsController } from './luie-operations.controller';

@Module({
  imports: [DatabaseModule, EmailModule, LuieModule],
  controllers: [SecurityController, PublicApiController, LuieOperationsController],
  providers: [SecurityService, ApiKeyGuard, PublicApiRateLimitGuard, PublicApiScopeGuard, RolesGuard, LuieOperationsService],
  exports: [SecurityService],
})
export class SecurityModule {}
