import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PlatformOwnerGuard } from './platform-owner.guard';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../common/email/email.module';

@Module({
  imports: [DatabaseModule, EmailModule],
  controllers: [AdminController],
  providers: [AdminService, PlatformOwnerGuard],
  exports: [AdminService],
})
export class AdminModule {}
