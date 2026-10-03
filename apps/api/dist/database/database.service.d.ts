import { Pool, PoolClient, QueryConfig, QueryResult } from 'pg';
export declare class DatabaseService {
    private readonly pool;
    private readonly logger;
    constructor(pool: Pool);
    query<T = Record<string, unknown>>(queryTextOrConfig: string | QueryConfig, values?: unknown[]): Promise<QueryResult<T>>;
    getClient(): Promise<PoolClient>;
    transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
    findOne<T = Record<string, unknown>>(table: string, conditions: Record<string, unknown>): Promise<T | null>;
    findMany<T = Record<string, unknown>>(table: string, conditions?: Record<string, unknown>, options?: {
        limit?: number;
        offset?: number;
        orderBy?: string;
    }): Promise<T[]>;
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=database.service.d.ts.map