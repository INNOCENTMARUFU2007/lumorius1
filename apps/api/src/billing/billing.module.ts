import { Module } from '@nestjs/common';

import { BillingController } from './billing.controller';
import { DodoBillingService } from './dodo-billing.service';
import { BillingService } from './billing.service';

import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    DatabaseModule,
  ],

  controllers: [
    BillingController,
  ],

  providers: [
    DodoBillingService,
    BillingService,
  ],

  exports: [
    BillingService,
  ],
})
export class BillingModule {}