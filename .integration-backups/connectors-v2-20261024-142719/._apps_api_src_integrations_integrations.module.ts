import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IntegrationsController, IntegrationsOAuthController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [DatabaseModule],
  controllers: [IntegrationsController, IntegrationsOAuthController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}