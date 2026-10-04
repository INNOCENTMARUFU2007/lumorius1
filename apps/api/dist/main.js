"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const config_1 = require("@nestjs/config");
const Sentry = __importStar(require("@sentry/node"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const app_module_1 = require("./app.module");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
const logging_interceptor_1 = require("./common/interceptors/logging.interceptor");
const transform_interceptor_1 = require("./common/interceptors/transform.interceptor");
async function bootstrap() {
    const logger = new common_1.Logger('Bootstrap');
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['error', 'warn', 'log', 'debug'],
        bufferLogs: true,
    });
    const configService = app.get(config_1.ConfigService);
    const port = configService.get('PORT', 3001);
    const appUrl = configService.get('APP_URL', 'http://localhost:3000');
    const nodeEnv = configService.get('NODE_ENV', 'development');
    const sentryDsn = configService.get('SENTRY_DSN');
    if (sentryDsn) {
        Sentry.init({
            dsn: sentryDsn,
            environment: nodeEnv,
            tracesSampleRate: nodeEnv === 'production'
                ? 0.1
                : 1.0,
        });
        logger.log('Sentry error tracking enabled');
    }
    app.use((0, compression_1.default)());
    app.use((0, helmet_1.default)({
        crossOriginEmbedderPolicy: false,
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                ],
                imgSrc: [
                    "'self'",
                    'data:',
                    'https:',
                ],
                fontSrc: [
                    "'self'",
                    'data:',
                ],
                connectSrc: [
                    "'self'",
                    'https:',
                ],
                frameAncestors: ["'none'"],
            },
        },
        hsts: {
            maxAge: 63072000,
            includeSubDomains: true,
            preload: true,
        },
    }));
    const allowedOrigins = [
        appUrl,
        'http://localhost:3000',
        'http://localhost:3001',
    ];
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin ||
                allowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        methods: [
            'GET',
            'POST',
            'PUT',
            'PATCH',
            'DELETE',
            'OPTIONS',
        ],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Organization-ID',
            'X-API-Key',
        ],
        exposedHeaders: [
            'X-RateLimit-Limit',
            'X-RateLimit-Remaining',
            'X-RateLimit-Reset',
        ],
    });
    app.setGlobalPrefix('api');
    app.enableVersioning({
        type: common_1.VersioningType.URI,
        defaultVersion: '1',
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
        stopAtFirstError: false,
    }));
    app.useGlobalFilters(new http_exception_filter_1.HttpExceptionFilter());
    app.useGlobalInterceptors(new logging_interceptor_1.LoggingInterceptor(), new transform_interceptor_1.TransformInterceptor());
    if (nodeEnv !== 'production') {
        const swaggerConfig = new swagger_1.DocumentBuilder()
            .setTitle('Lumorius AI API')
            .setDescription('## The AI Operating System for Modern Businesses\n\n' +
            'Built by **INMARTECH PVT LTD**\n\n' +
            'All endpoints require Bearer JWT unless marked public.')
            .setVersion('1.0.0')
            .setContact('INMARTECH PVT LTD', 'https://lumorius.com', 'support@lumorius.com')
            .setLicense('Proprietary', '')
            .addBearerAuth({
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
        }, 'access-token')
            .addApiKey({
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
        }, 'api-key')
            .addServer(appUrl, 'Production')
            .addServer('http://localhost:3001', 'Local Development')
            .addTag('auth', 'Authentication, sessions & MFA')
            .addTag('admin', 'Admin — user & organisation management')
            .addTag('organizations', 'Organisation management')
            .addTag('users', 'User profiles')
            .addTag('documents', 'Company Brain — RAG document upload & search')
            .addTag('meetings', 'Meeting Intelligence')
            .addTag('tasks', 'Task & project management')
            .addTag('knowledge', 'Knowledge Graph')
            .addTag('analytics', 'Business analytics & Founder OS metrics')
            .addTag('founder-os', 'Founder OS — OKRs, KPIs & health scoring')
            .addTag('ai', 'AI Strategy Advisor & conversations')
            .addTag('billing', 'Billing & Stripe subscriptions')
            .addTag('workflows', 'Workflow automation')
            .addTag('security', 'API keys, audit logs & session management')
            .addTag('notifications', 'In-app notifications')
            .addTag('gdpr', 'GDPR — data export & right to erasure')
            .addTag('metrics', 'Prometheus metrics (internal)')
            .addTag('health', 'Health checks')
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
        swagger_1.SwaggerModule.setup('api/docs', app, document, {
            swaggerOptions: {
                persistAuthorization: true,
                defaultModelsExpandDepth: 2,
            },
        });
        logger.log('📖 Swagger docs: /api/docs');
    }
    await app.listen(port, '0.0.0.0');
    logger.log(`🚀 Lumorius API running on port ${port} [${nodeEnv}]`);
    const signals = [
        'SIGTERM',
        'SIGINT',
        'SIGHUP',
    ];
    signals.forEach((signal) => {
        process.on(signal, async () => {
            logger.warn(`Received ${signal} — shutting down gracefully…`);
            await app.close();
            logger.log('Application closed cleanly');
            process.exit(0);
        });
    });
    process.on('unhandledRejection', (reason) => {
        logger.error('Unhandled promise rejection', reason);
        if (sentryDsn) {
            Sentry.captureException(reason);
        }
    });
    process.on('uncaughtException', (err) => {
        logger.error('Uncaught exception', err);
        if (sentryDsn) {
            Sentry.captureException(err);
        }
        process.exit(1);
    });
}
bootstrap();
//# sourceMappingURL=main.js.map