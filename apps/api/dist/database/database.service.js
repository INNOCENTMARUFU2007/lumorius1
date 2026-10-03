"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DatabaseService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
let DatabaseService = DatabaseService_1 = class DatabaseService {
    constructor(pool) {
        this.pool = pool;
        this.logger = new common_1.Logger(DatabaseService_1.name);
    }
    async query(queryTextOrConfig, values) {
        const start = Date.now();
        try {
            const result = await this.pool.query(queryTextOrConfig, values);
            const duration = Date.now() - start;
            if (duration > 1000) {
                this.logger.warn(`Slow query detected (${duration}ms)`);
            }
            return result;
        }
        catch (error) {
            this.logger.error('Database query error', error);
            throw error;
        }
    }
    async getClient() {
        return this.pool.connect();
    }
    async transaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async findOne(table, conditions) {
        const keys = Object.keys(conditions);
        const values = Object.values(conditions);
        const where = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
        const result = await this.query(`SELECT * FROM ${table} WHERE ${where} LIMIT 1`, values);
        return result.rows[0] ?? null;
    }
    async findMany(table, conditions = {}, options = {}) {
        const keys = Object.keys(conditions);
        const values = Object.values(conditions);
        const where = keys.length > 0
            ? `WHERE ${keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ')}`
            : '';
        const orderBy = options.orderBy ? `ORDER BY ${options.orderBy}` : '';
        const limit = options.limit ? `LIMIT ${options.limit}` : '';
        const offset = options.offset ? `OFFSET ${options.offset}` : '';
        const result = await this.query(`SELECT * FROM ${table} ${where} ${orderBy} ${limit} ${offset}`.trim(), values);
        return result.rows;
    }
    async healthCheck() {
        try {
            await this.query('SELECT 1');
            return true;
        }
        catch {
            return false;
        }
    }
};
exports.DatabaseService = DatabaseService;
exports.DatabaseService = DatabaseService = DatabaseService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('PG_POOL')),
    __metadata("design:paramtypes", [pg_1.Pool])
], DatabaseService);
//# sourceMappingURL=database.service.js.map