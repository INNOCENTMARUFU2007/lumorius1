export function validateEnvironment(
  env: Record<string, unknown>,
): Record<string, unknown> {
  if (env.NODE_ENV !== 'production') {
    return env;
  }

  const required = [
    'APP_URL',
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'S3_BUCKET',
  ];
  for (const key of required) {
    const value = env[key];
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      /change.?me|your-domain\.com|placeholder/i.test(value)
    ) {
      throw new Error(`${key} must be configured with a production value.`);
    }
  }

  let appUrl: URL;
  try {
    appUrl = new URL(String(env.APP_URL));
  } catch {
    throw new Error('APP_URL must be a valid HTTPS URL in production.');
  }
  if (appUrl.protocol !== 'https:' || appUrl.hostname === 'your-domain.com') {
    throw new Error('APP_URL must be a valid HTTPS URL in production.');
  }

  const jwtSecret = String(env.JWT_SECRET);
  const refreshSecret = String(env.JWT_REFRESH_SECRET);
  if (jwtSecret.length < 64 || refreshSecret.length < 64 || jwtSecret === refreshSecret) {
    throw new Error(
      'JWT_SECRET and JWT_REFRESH_SECRET must be distinct secrets of at least 64 characters.',
    );
  }

  const provider = String(env.AI_DEFAULT_PROVIDER || 'openai').toLowerCase();
  const providerKeys: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
  };
  const providerKey = providerKeys[provider];
  if (!providerKey) {
    throw new Error(`AI_DEFAULT_PROVIDER "${provider}" is not supported.`);
  }
  const aiKey = env[providerKey];
  if (
    typeof aiKey !== 'string' ||
    aiKey.trim().length < 20 ||
    /placeholder|^sk-\.\.\.$/i.test(aiKey)
  ) {
    throw new Error(`${providerKey} must be configured for the selected AI provider.`);
  }

  const s3AccessKey = env.S3_ACCESS_KEY || env.AWS_ACCESS_KEY_ID;
  const s3SecretKey = env.S3_SECRET_KEY || env.AWS_SECRET_ACCESS_KEY;
  if (Boolean(s3AccessKey) !== Boolean(s3SecretKey)) {
    throw new Error('Configure both S3 access-key values or use an instance role.');
  }

  return env;
}

export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  database: {
    url: process.env.DATABASE_URL,
    sslCa: process.env.DATABASE_SSL_CA,
    poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
    connectionTimeoutMs: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS || '15000', 10),
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
    from: process.env.EMAIL_FROM || process.env.SMTP_FROM || 'no-reply@lumorius.com',
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET || 'lumorius-uploads',
    region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
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
