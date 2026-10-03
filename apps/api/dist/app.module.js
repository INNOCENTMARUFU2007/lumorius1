"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const schedule_1 = require("@nestjs/schedule");
const bull_1 = require("@nestjs/bull");
const event_emitter_1 = require("@nestjs/event-emitter");
const database_module_1 = require("./database/database.module");
const redis_module_1 = require("./common/redis/redis.module");
const vault_module_1 = require("./common/vault/vault.module");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const organizations_module_1 = require("./organizations/organizations.module");
const documents_module_1 = require("./documents/documents.module");
const meetings_module_1 = require("./meetings/meetings.module");
const tasks_module_1 = require("./tasks/tasks.module");
const knowledge_module_1 = require("./knowledge/knowledge.module");
const analytics_module_1 = require("./analytics/analytics.module");
const ai_module_1 = require("./ai/ai.module");
const billing_module_1 = require("./billing/billing.module");
const workflows_module_1 = require("./workflows/workflows.module");
const notifications_module_1 = require("./notifications/notifications.module");
const storage_module_1 = require("./storage/storage.module");
const health_module_1 = require("./health/health.module");
const security_module_1 = require("./security/security.module");
const founder_os_module_1 = require("./founder-os/founder-os.module");
const admin_module_1 = require("./admin/admin.module");
const metrics_module_1 = require("./metrics/metrics.module");
const gdpr_module_1 = require("./gdpr/gdpr.module");
const security_middleware_1 = require("./common/middleware/security.middleware");
const configuration_1 = __importDefault(require("./common/config/configuration"));
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(security_middleware_1.SecurityMiddleware).forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [configuration_1.default],
                expandVariables: true,
            }),
            event_emitter_1.EventEmitterModule.forRoot({
                wildcard: false,
                delimiter: '.',
                newListener: false,
                removeListener: false,
                maxListeners: 20,
                verboseMemoryLeak: true,
                ignoreErrors: false,
            }),
            throttler_1.ThrottlerModule.forRoot([
                { name: 'short', ttl: 1000, limit: 20 },
                { name: 'medium', ttl: 10000, limit: 100 },
                { name: 'long', ttl: 60000, limit: 500 },
            ]),
            schedule_1.ScheduleModule.forRoot(),
            bull_1.BullModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: (cfg) => ({
                    redis: cfg.get('redis.url'),
                    defaultJobOptions: {
                        removeOnComplete: 100,
                        removeOnFail: 200,
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 1000 },
                    },
                }),
                inject: [config_1.ConfigService],
            }),
            database_module_1.DatabaseModule,
            redis_module_1.RedisModule,
            vault_module_1.VaultModule,
            storage_module_1.StorageModule,
            security_module_1.SecurityModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            organizations_module_1.OrganizationsModule,
            documents_module_1.DocumentsModule,
            meetings_module_1.MeetingsModule,
            tasks_module_1.TasksModule,
            knowledge_module_1.KnowledgeModule,
            analytics_module_1.AnalyticsModule,
            founder_os_module_1.FounderOsModule,
            ai_module_1.AiModule,
            billing_module_1.BillingModule,
            workflows_module_1.WorkflowsModule,
            notifications_module_1.NotificationsModule,
            health_module_1.HealthModule,
            admin_module_1.AdminModule,
            metrics_module_1.MetricsModule,
            gdpr_module_1.GdprModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map