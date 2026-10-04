"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const pg_1 = require("pg");
const database_service_1 = require("./database.service");
const PG_POOL = 'PG_POOL';
const logger = new common_1.Logger('DatabaseModule');
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Module)({
        providers: [
            {
                provide: PG_POOL,
                inject: [config_1.ConfigService],
                useFactory: async (config) => {
                    const databaseUrl = config.get('database.url');
                    const poolMax = config.get('database.poolMax', 20);
                    const poolMin = config.get('database.poolMin', 2);
                    if (!databaseUrl) {
                        throw new Error('DATABASE_URL is not configured. Check your .env file.');
                    }
                    const pool = new pg_1.Pool({
                        connectionString: databaseUrl,
                        min: poolMin,
                        max: poolMax,
                        idleTimeoutMillis: 30_000,
                        connectionTimeoutMillis: 5_000,
                        ssl: config.get('nodeEnv') === 'production'
                            ? {
                                rejectUnauthorized: false,
                            }
                            : undefined,
                    });
                    try {
                        const client = await pool.connect();
                        try {
                            await client.query('SELECT 1');
                            logger.log('Database connection verified');
                            const extResult = await client.query(`SELECT EXISTS(
                   SELECT 1
                   FROM pg_extension
                   WHERE extname = 'vector'
                 ) AS installed`);
                            const installed = extResult.rows[0]?.installed ===
                                true;
                            if (!installed) {
                                logger.warn('pgvector extension not found — attempting CREATE EXTENSION');
                                try {
                                    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
                                    logger.log('pgvector extension created successfully');
                                }
                                catch (extErr) {
                                    const msg = extErr instanceof Error
                                        ? extErr.message
                                        : String(extErr);
                                    logger.error(`pgvector extension could not be created: ${msg}. ` +
                                        'Semantic search will be unavailable until the extension is installed by a superuser.');
                                }
                            }
                            else {
                                logger.log('pgvector extension verified ✓');
                            }
                            await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
                            logger.log('uuid-ossp extension verified ✓');
                        }
                        finally {
                            client.release();
                        }
                    }
                    catch (err) {
                        const msg = err instanceof Error
                            ? err.message
                            : String(err);
                        logger.error(`Database startup check failed: ${msg}`);
                        throw err;
                    }
                    return pool;
                },
            },
            database_service_1.DatabaseService,
        ],
        exports: [
            database_service_1.DatabaseService,
        ],
    })
], DatabaseModule);
//# sourceMappingURL=database.module.js.map