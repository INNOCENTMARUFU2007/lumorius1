import { Global, Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

function buildRedisOptions(config: ConfigService): RedisOptions {
  const url      = config.get<string>('REDIS_URL', 'redis://localhost:6379');
  const sentinel = config.get<string>('REDIS_SENTINELS', '');

  const base: RedisOptions = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 10_000,
    commandTimeout: 5_000,
    retryStrategy: (times) => {
      if (times > 20) return null;
      return Math.min(times * 200, 3_000);
    },
    reconnectOnError: (err) => {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some((e) => err.message.includes(e)) ? 2 : false;
    },
    lazyConnect: false,
  };

  if (sentinel) {
    const sentinelList = sentinel.split(',').map((s) => {
      const [host, port] = s.trim().split(':');
      return { host: host.trim(), port: parseInt(port ?? '26379', 10) };
    });
    return {
      ...base,
      sentinels: sentinelList,
      name: config.get<string>('REDIS_SENTINEL_NAME', 'mymaster'),
      sentinelPassword: config.get<string>('REDIS_SENTINEL_PASSWORD'),
      password: config.get<string>('REDIS_PASSWORD'),
    };
  }

  const parsed = new URL(url);
  return {
    ...base,
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || config.get<string>('REDIS_PASSWORD') || undefined,
    db: parseInt(parsed.pathname.replace('/', '') || '0', 10),
    tls: url.startsWith('rediss://') ? {} : undefined,
  };
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const logger  = new Logger('RedisModule');
        const options = buildRedisOptions(config);
        const client  = new Redis(options);

        client.on('connect',        () => logger.log('Redis connected'));
        client.on('ready',          () => logger.log('Redis ready'));
        client.on('error',          (err) => logger.error('Redis error', err.message));
        client.on('close',          () => logger.warn('Redis connection closed'));
        client.on('reconnecting',   () => logger.warn('Redis reconnecting…'));
        client.on('+sentinel',      (sen) => logger.log(`Sentinel active: ${sen.host}:${sen.port}`));
        client.on('+switch-master', (name, from, to) => logger.warn(`Sentinel failover: ${name} → ${to}`));

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
