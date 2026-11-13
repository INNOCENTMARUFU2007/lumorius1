import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './common/redis/redis.module';
import { VaultModule } from './common/vault/vault.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { DocumentsModule } from './documents/documents.module';
import { MeetingsModule } from './meetings/meetings.module';
import { TasksModule } from './tasks/tasks.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ExecutiveIntelligenceModule } from './executive-intelligence/executive-intelligence.module';
import { AiModule } from './ai/ai.module';
import { BillingModule } from './billing/billing.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';
import { SecurityModule } from './security/security.module';
import { FounderOsModule } from './founder-os/founder-os.module';
import { AdminModule } from './admin/admin.module';
import { MetricsModule } from './metrics/metrics.module';
import { GdprModule } from './gdpr/gdpr.module';
import { SecurityMiddleware } from './common/middleware/security.middleware';
import configuration, { validateEnvironment } from './common/config/configuration';
import { LuieModule } from './luie/luie.module';


@Module({
  imports: [
    LuieModule,
   ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: '../../.env',
  load: [configuration],
  validate: validateEnvironment,
  expandVariables: true,
}),
    // Global event emitter â€” enables @OnEvent() decorators across all modules
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),
    ThrottlerModule.forRoot([
      { name: 'short',  ttl: 1000,  limit: 20  },
      { name: 'medium', ttl: 10000, limit: 100 },
      { name: 'long',   ttl: 60000, limit: 500 },
    ]),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        redis: cfg.get('redis.url'),
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 200,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    RedisModule,
    VaultModule,
    StorageModule,
    SecurityModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    DocumentsModule,
    MeetingsModule,
    TasksModule,
    KnowledgeModule,
    AnalyticsModule,
    ExecutiveIntelligenceModule,
    FounderOsModule,
    AiModule,
    BillingModule,
    IntegrationsModule,
    WorkflowsModule,
    NotificationsModule,
    HealthModule,
    AdminModule,
    MetricsModule,
    GdprModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware).forRoutes('*');
  }
}
