import { Module } from '@nestjs/common';
import { FounderOsService } from './founder-os.service';
import { FounderOsController } from './founder-os.controller';
import { DatabaseModule } from '../database/database.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, AiModule],
  controllers: [FounderOsController],
  providers: [FounderOsService],
  exports: [FounderOsService],
})
export class FounderOsModule {}
