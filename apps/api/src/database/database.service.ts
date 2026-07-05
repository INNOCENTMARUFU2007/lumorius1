import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool, PoolClient, QueryConfig, QueryResult } from 'pg';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@Inject('PG_POOL') private readonly pool: Pool) {}

  async query<T = Record<string, unknown>>(
    queryTextOrConfig: string | QueryConfig,
    values?: unknown[],
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(queryTextOrConfig, values);
      const duration = Date.now() - start;
      if (duration > 1000) {
        this.logger.warn(`Slow query detected (${duration}ms)`);
      }
      return result;
    } catch (error) {
      this.logger.error('Database query error', error);
      throw error;
    }
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findOne<T = Record<string, unknown>>(
    table: string,
    conditions: Record<string, unknown>,
  ): Promise<T | null> {
    const keys = Object.keys(conditions);
    const values = Object.values(conditions);
    const where = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
    const result = await this.query<T>(
      `SELECT * FROM ${table} WHERE ${where} LIMIT 1`,
      values,
    );
    return result.rows[0] ?? null;
  }

  async findMany<T = Record<string, unknown>>(
    table: string,
    conditions: Record<string, unknown> = {},
    options: { limit?: number; offset?: number; orderBy?: string } = {},
  ): Promise<T[]> {
    const keys = Object.keys(conditions);
    const values = Object.values(conditions);
    const where =
      keys.length > 0
        ? `WHERE ${keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ')}`
        : '';
    const orderBy = options.orderBy ? `ORDER BY ${options.orderBy}` : '';
    const limit = options.limit ? `LIMIT ${options.limit}` : '';
    const offset = options.offset ? `OFFSET ${options.offset}` : '';
    const result = await this.query<T>(
      `SELECT * FROM ${table} ${where} ${orderBy} ${limit} ${offset}`.trim(),
      values,
    );
    return result.rows;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
