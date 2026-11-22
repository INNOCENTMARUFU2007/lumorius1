import {
  Module,
  Logger,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

import { DatabaseService } from './database.service';

const PG_POOL = 'PG_POOL';
const logger = new Logger('DatabaseModule');

@Module({
  providers: [
    {
      provide: PG_POOL,

      inject: [ConfigService],

      useFactory: async (
        config: ConfigService,
      ): Promise<Pool> => {
        const databaseUrl =
          config.get<string>('database.url');

        const poolMax =
          config.get<number>(
            'database.poolMax',
            20,
          );

        const poolMin =
          config.get<number>(
            'database.poolMin',
            2,
          );

        if (!databaseUrl) {
          throw new Error(
            'DATABASE_URL is not configured. Check your .env file.',
          );
        }

        const pool = new Pool({
          connectionString: databaseUrl,

          min: poolMin,
          max: poolMax,

          idleTimeoutMillis: 30_000,
          // How long a request waits for a free connection before failing.
          connectionTimeoutMillis: config.get<number>('database.connectionTimeoutMs', 15_000),

          ssl: config.get<string>('nodeEnv') === 'production'
            ? {
                rejectUnauthorized: true,
                ca: config.get<string>('database.sslCa') || undefined,
              }
            : undefined,
        });

        // Verify database connection
        try {
          const client =
            await pool.connect();

          try {
            await client.query(
              'SELECT 1',
            );

            logger.log(
              'Database connection verified',
            );

            // Verify pgvector
            const extResult =
              await client.query(
                `SELECT EXISTS(
                   SELECT 1
                   FROM pg_extension
                   WHERE extname = 'vector'
                 ) AS installed`,
              );

            const installed =
              extResult.rows[0]?.installed ===
              true;

            if (!installed) {
              throw new Error(
                'pgvector is not installed. Apply database migrations with a database owner before starting the API.',
              );
            } else {
              logger.log(
                'pgvector extension verified ✓',
              );
            }

          } finally {
            client.release();
          }
        } catch (err: unknown) {
          const msg =
            err instanceof Error
              ? err.message
              : String(err);

          logger.error(
            `Database startup check failed: ${msg}`,
          );

          // Do not hide configuration errors.
          throw err;
        }

        return pool;
      },
    },

    DatabaseService,
  ],

  exports: [
    DatabaseService,
  ],
})
export class DatabaseModule {}