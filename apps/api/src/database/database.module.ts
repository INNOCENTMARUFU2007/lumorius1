import { Module, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DatabaseService } from './database.service';

const PG_POOL = 'PG_POOL';
const logger  = new Logger('DatabaseModule');

@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<Pool> => {
        const pool = new Pool({
          connectionString: config.get<string>('DATABASE_URL'),
          max: config.get<number>('DB_POOL_MAX', 20),
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
          ssl: config.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : undefined,
        });

        // Verify connection + pgvector extension at startup
        try {
          const client = await pool.connect();
          try {
            // Verify basic connectivity
            await client.query('SELECT 1');
            logger.log('Database connection verified');

            // Ensure pgvector extension is installed (NX-000014)
            const extResult = await client.query(
              `SELECT EXISTS(
                 SELECT 1 FROM pg_extension WHERE extname = 'vector'
               ) AS installed`,
            );
            const installed: boolean = extResult.rows[0]?.installed === true;

            if (!installed) {
              logger.warn('pgvector extension not found — attempting CREATE EXTENSION');
              try {
                await client.query('CREATE EXTENSION IF NOT EXISTS vector');
                logger.log('pgvector extension created successfully');
              } catch (extErr: unknown) {
                const msg = extErr instanceof Error ? extErr.message : String(extErr);
                logger.error(
                  `pgvector extension could not be created: ${msg}. ` +
                  'Semantic search will be unavailable until the extension is installed by a superuser.',
                );
              }
            } else {
              logger.log('pgvector extension verified ✓');
            }

            // Verify uuid-ossp for gen_random_uuid()
            await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
            logger.log('uuid-ossp extension verified ✓');
          } finally {
            client.release();
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`Database startup check failed: ${msg}`);
          // Do not throw — let health check surface it to load balancer
        }

        return pool;
      },
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
