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
exports.RedisModule = exports.REDIS_CLIENT = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
exports.REDIS_CLIENT = 'REDIS_CLIENT';
function buildRedisOptions(config) {
    const url = config.get('REDIS_URL', 'redis://localhost:6379');
    const sentinel = config.get('REDIS_SENTINELS', '');
    const base = {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        connectTimeout: 10_000,
        commandTimeout: 5_000,
        retryStrategy: (times) => {
            if (times > 20)
                return null;
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
            name: config.get('REDIS_SENTINEL_NAME', 'mymaster'),
            sentinelPassword: config.get('REDIS_SENTINEL_PASSWORD'),
            password: config.get('REDIS_PASSWORD'),
        };
    }
    const parsed = new URL(url);
    return {
        ...base,
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379', 10),
        password: parsed.password || config.get('REDIS_PASSWORD') || undefined,
        db: parseInt(parsed.pathname.replace('/', '') || '0', 10),
        tls: url.startsWith('rediss://') ? {} : undefined,
    };
}
let RedisModule = class RedisModule {
};
exports.RedisModule = RedisModule;
exports.RedisModule = RedisModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: exports.REDIS_CLIENT,
                inject: [config_1.ConfigService],
                useFactory: (config) => {
                    const logger = new common_1.Logger('RedisModule');
                    const options = buildRedisOptions(config);
                    const client = new ioredis_1.default(options);
                    client.on('connect', () => logger.log('Redis connected'));
                    client.on('ready', () => logger.log('Redis ready'));
                    client.on('error', (err) => logger.error('Redis error', err.message));
                    client.on('close', () => logger.warn('Redis connection closed'));
                    client.on('reconnecting', () => logger.warn('Redis reconnecting…'));
                    client.on('+sentinel', (sen) => logger.log(`Sentinel active: ${sen.host}:${sen.port}`));
                    client.on('+switch-master', (name, from, to) => logger.warn(`Sentinel failover: ${name} → ${to}`));
                    return client;
                },
            },
        ],
        exports: [exports.REDIS_CLIENT],
    })
], RedisModule);
//# sourceMappingURL=redis.module.js.map