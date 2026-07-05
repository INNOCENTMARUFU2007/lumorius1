import { Module } from '@nestjs/common';
import { SecurityService } from './security.service';
import { SecurityController } from './security.controller';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../common/email/email.module';

@Module({
  imports: [DatabaseModule, EmailModule],
  controllers: [SecurityController],
  providers: [SecurityService],
  exports: [SecurityService],
})
export class SecurityModule {}
