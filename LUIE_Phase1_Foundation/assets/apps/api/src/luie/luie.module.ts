import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { LuieConsumerRegistry } from './luie-consumer.registry';
import { LuieEventDeliveryService } from './luie-event-delivery.service';
import { LuieEventPublisher } from './luie-event.publisher';

@Module({
  imports: [DatabaseModule],
  providers: [LuieEventPublisher, LuieConsumerRegistry, LuieEventDeliveryService],
  exports: [LuieEventPublisher, LuieConsumerRegistry],
})
export class LuieModule {}
