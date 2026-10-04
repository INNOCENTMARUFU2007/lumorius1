import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import {
  ValidationPipe,
  Logger,
  VersioningType,
} from '@nestjs/common';

import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';

import { ConfigService } from '@nestjs/config';

import * as Sentry from '@sentry/node';
import helmet from 'helmet';
import compression from 'compression';

import { AppModule } from './app.module';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);

  const port = configService.get<number>(
    'PORT',
    3001,
  );

  const appUrl = configService.get<string>(
    'APP_URL',
    'http://localhost:3000',
  );

  const nodeEnv = configService.get<string>(
    'NODE_ENV',
    'development',
  );

  const sentryDsn = configService.get<string>(
    'SENTRY_DSN',
  );

  // ── Sentry ───────────────────────────────────────────────────

  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: nodeEnv,
      tracesSampleRate:
        nodeEnv === 'production'
          ? 0.1
          : 1.0,
    });

    logger.log(
      'Sentry error tracking enabled',
    );
  }

  // ── Compression ─────────────────────────────────────────────

  app.use(compression());

  // ── Security headers ────────────────────────────────────────

  app.use(
    helmet({
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
    }),
  );

  // ── CORS ────────────────────────────────────────────────────

  const allowedOrigins = [
    appUrl,
    'http://localhost:3000',
    'http://localhost:3001',
  ];

  app.enableCors({
    origin: (
      origin,
      callback,
    ) => {
      if (
        !origin ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(
        new Error(
          'Not allowed by CORS',
        ),
      );
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

  // ── Global prefix & API versioning ─────────────────────────

  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // ── Validation ─────────────────────────────────────────────

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,

      transformOptions: {
        enableImplicitConversion: true,
      },

      stopAtFirstError: false,
    }),
  );

  // ── Global filters & interceptors ───────────────────────────

  app.useGlobalFilters(
    new HttpExceptionFilter(),
  );

  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // ── Swagger / OpenAPI ───────────────────────────────────────

  if (nodeEnv !== 'production') {
    const swaggerConfig =
      new DocumentBuilder()
        .setTitle(
          'Lumorius AI API',
        )
        .setDescription(
          '## The AI Operating System for Modern Businesses\n\n' +
            'Built by **INMARTECH PVT LTD**\n\n' +
            'All endpoints require Bearer JWT unless marked public.',
        )
        .setVersion('1.0.0')
        .setContact(
          'INMARTECH PVT LTD',
          'https://lumorius.com',
          'support@lumorius.com',
        )
        .setLicense(
          'Proprietary',
          '',
        )
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          'access-token',
        )
        .addApiKey(
          {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
          'api-key',
        )
        .addServer(
          appUrl,
          'Production',
        )
        .addServer(
          'http://localhost:3001',
          'Local Development',
        )

        .addTag(
          'auth',
          'Authentication, sessions & MFA',
        )

        .addTag(
          'admin',
          'Admin — user & organisation management',
        )

        .addTag(
          'organizations',
          'Organisation management',
        )

        .addTag(
          'users',
          'User profiles',
        )

        .addTag(
          'documents',
          'Company Brain — RAG document upload & search',
        )

        .addTag(
          'meetings',
          'Meeting Intelligence',
        )

        .addTag(
          'tasks',
          'Task & project management',
        )

        .addTag(
          'knowledge',
          'Knowledge Graph',
        )

        .addTag(
          'analytics',
          'Business analytics & Founder OS metrics',
        )

        .addTag(
          'founder-os',
          'Founder OS — OKRs, KPIs & health scoring',
        )

        .addTag(
          'ai',
          'AI Strategy Advisor & conversations',
        )

        .addTag(
          'billing',
          'Billing & Stripe subscriptions',
        )

        .addTag(
          'workflows',
          'Workflow automation',
        )

        .addTag(
          'security',
          'API keys, audit logs & session management',
        )

        .addTag(
          'notifications',
          'In-app notifications',
        )

        .addTag(
          'gdpr',
          'GDPR — data export & right to erasure',
        )

        .addTag(
          'metrics',
          'Prometheus metrics (internal)',
        )

        .addTag(
          'health',
          'Health checks',
        )

        .build();

    const document =
      SwaggerModule.createDocument(
        app,
        swaggerConfig,
      );

    SwaggerModule.setup(
      'api/docs',
      app,
      document,
      {
        swaggerOptions: {
          persistAuthorization: true,
          defaultModelsExpandDepth: 2,
        },
      },
    );

    logger.log(
      '📖 Swagger docs: /api/docs',
    );
  }

  // ── Start ───────────────────────────────────────────────────

  await app.listen(
    port,
    '0.0.0.0',
  );

  logger.log(
    `🚀 Lumorius API running on port ${port} [${nodeEnv}]`,
  );

  // ── Graceful shutdown ──────────────────────────────────────

  const signals: NodeJS.Signals[] = [
    'SIGTERM',
    'SIGINT',
    'SIGHUP',
  ];

  signals.forEach((signal) => {
    process.on(
      signal,
      async () => {
        logger.warn(
          `Received ${signal} — shutting down gracefully…`,
        );

        await app.close();

        logger.log(
          'Application closed cleanly',
        );

        process.exit(0);
      },
    );
  });

  // ── Unhandled rejections ───────────────────────────────────

  process.on(
    'unhandledRejection',
    (reason: unknown) => {
      logger.error(
        'Unhandled promise rejection',
        reason,
      );

      if (sentryDsn) {
        Sentry.captureException(
          reason,
        );
      }
    },
  );

  // ── Uncaught exceptions ────────────────────────────────────

  process.on(
    'uncaughtException',
    (err: Error) => {
      logger.error(
        'Uncaught exception',
        err,
      );

      if (sentryDsn) {
        Sentry.captureException(
          err,
        );
      }

      process.exit(1);
    },
  );
}

bootstrap();