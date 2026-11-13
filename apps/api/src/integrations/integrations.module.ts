import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { DocumentsModule } from '../documents/documents.module';
import { IntegrationsController, IntegrationsOAuthController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { LuieModule } from '../luie/luie.module';

@Module({
  imports: [ConfigModule, DatabaseModule, DocumentsModule, LuieModule],
  controllers: [IntegrationsController, IntegrationsOAuthController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}