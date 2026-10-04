import { Module } from '@nestjs/common';

import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../common/email/email.module';

@Module({
  imports: [
    DatabaseModule,
    EmailModule,
  ],

  controllers: [
    OrganizationsController,
  ],

  providers: [
    OrganizationsService,
  ],

  exports: [
    OrganizationsService,
  ],
})
export class OrganizationsModule {}