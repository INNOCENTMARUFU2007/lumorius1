"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = () => ({
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    appUrl: process.env.APP_URL || 'http://localhost:3000',
    database: {
        url: process.env.DATABASE_URL,
        poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
        poolMax: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
    },
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        password: process.env.REDIS_PASSWORD,
    },
    jwt: {
        secret: process.env.JWT_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    session: {
        secret: process.env.SESSION_SECRET,
    },
    oauth: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
        github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
        },
        microsoft: {
            clientId: process.env.MICROSOFT_CLIENT_ID,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        },
    },
    email: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.EMAIL_FROM || 'no-reply@lumorius.com',
    },
    s3: {
        endpoint: process.env.S3_ENDPOINT,
        bucket: process.env.S3_BUCKET || 'lumorius-uploads',
        region: process.env.S3_REGION || 'us-east-1',
        accessKey: process.env.S3_ACCESS_KEY,
        secretKey: process.env.S3_SECRET_KEY,
    },
    ai: {
        openai: { apiKey: process.env.OPENAI_API_KEY },
        anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
        gemini: { apiKey: process.env.GEMINI_API_KEY },
        defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'openai',
        embeddingModel: 'text-embedding-3-small',
    },
    opensearch: {
        url: process.env.OPENSEARCH_URL || 'http://localhost:9200',
        user: process.env.OPENSEARCH_USER || 'admin',
        password: process.env.OPENSEARCH_PASSWORD,
    },
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    },
    sentry: {
        dsn: process.env.SENTRY_DSN,
    },
});
//# sourceMappingURL=configuration.js.map