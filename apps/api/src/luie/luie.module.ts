import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { LuieConsumerRegistry } from './luie-consumer.registry';
import { LuieEventDeliveryService } from './luie-event-delivery.service';
import { LuieEventPublisher } from './luie-event.publisher';
import { LuieLegacyDomainBridgeConsumer } from './luie-legacy-domain-bridge.consumer';
import { LuieChangeFeedController } from './luie-change-feed.controller';
import { LuieChangeFeedService } from './luie-change-feed.service';

@Module({
  imports: [DatabaseModule],
  controllers: [LuieChangeFeedController],
  providers: [
    LuieEventPublisher,
    LuieConsumerRegistry,
    LuieEventDeliveryService,
    LuieLegacyDomainBridgeConsumer,
    LuieChangeFeedService,
  ],
  exports: [LuieEventPublisher, LuieConsumerRegistry],
})
export class LuieModule {}
