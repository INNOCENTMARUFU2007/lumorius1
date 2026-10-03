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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const database_service_1 = require("../database/database.service");
let NotificationsService = class NotificationsService {
    constructor(db) {
        this.db = db;
    }
    async create(opts) {
        const id = (0, uuid_1.v4)();
        await this.db.query(`INSERT INTO notifications (id, user_id, organization_id, type, title, message, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, opts.userId, opts.organizationId, opts.type, opts.title,
            opts.message ?? null, JSON.stringify(opts.data ?? {})]);
        return { id };
    }
    async findAll(userId, unreadOnly = false) {
        const where = unreadOnly ? 'AND read_at IS NULL' : '';
        const res = await this.db.query(`SELECT id, type, title, message, data, read_at, created_at
       FROM notifications WHERE user_id = $1 ${where}
       ORDER BY created_at DESC LIMIT 50`, [userId]);
        return res.rows;
    }
    async markRead(userId, notificationId) {
        await this.db.query('UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2', [notificationId, userId]);
        return { read: true };
    }
    async markAllRead(userId) {
        await this.db.query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [userId]);
        return { read: true };
    }
    async getUnreadCount(userId) {
        const res = await this.db.query('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]);
        return { count: parseInt(res.rows[0]?.count ?? '0', 10) };
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map