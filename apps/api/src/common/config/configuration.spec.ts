import { validateEnvironment } from './configuration';

describe('validateEnvironment', () => {
  const productionEnvironment = {
    NODE_ENV: 'production',
    APP_URL: 'https://app.example.com',
    DATABASE_URL: 'postgresql://app:secret@db.example.internal:5432/lumorius',
    REDIS_URL: 'rediss://cache.example.internal:6379',
    JWT_SECRET: 'a'.repeat(64),
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    S3_BUCKET: 'lumorius-production',
    AI_DEFAULT_PROVIDER: 'openai',
    OPENAI_API_KEY: `sk-${'c'.repeat(48)}`,
  };

  it('does not impose production-only settings on development', () => {
    const environment = { NODE_ENV: 'development' };
    expect(validateEnvironment(environment)).toBe(environment);
  });

  it('accepts distinct, sufficiently strong production secrets and configured services', () => {
    expect(validateEnvironment(productionEnvironment)).toBe(productionEnvironment);
  });

  it('rejects placeholder secrets and insecure application URLs', () => {
    expect(() => validateEnvironment({
      ...productionEnvironment,
      APP_URL: 'http://localhost:3000',
    })).toThrow('APP_URL must be a valid HTTPS URL');

    expect(() => validateEnvironment({
      ...productionEnvironment,
      JWT_SECRET: 'CHANGE_ME',
    })).toThrow('JWT_SECRET must be configured');
  });

  it('rejects duplicate or weak JWT secrets', () => {
    expect(() => validateEnvironment({
      ...productionEnvironment,
      JWT_REFRESH_SECRET: productionEnvironment.JWT_SECRET,
    })).toThrow('must be distinct secrets');
  });

  it('requires a valid key for the selected AI provider', () => {
    expect(() => validateEnvironment({
      ...productionEnvironment,
      ANTHROPIC_API_KEY: undefined,
      AI_DEFAULT_PROVIDER: 'anthropic',
    })).toThrow('ANTHROPIC_API_KEY must be configured');
  });
});
