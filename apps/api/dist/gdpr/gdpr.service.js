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
var GdprService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GdprService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const email_service_1 = require("../common/email/email.service");
let GdprService = GdprService_1 = class GdprService {
    constructor(db, email) {
        this.db = db;
        this.email = email;
        this.logger = new common_1.Logger(GdprService_1.name);
    }
    async exportUserData(userId) {
        const user = await this.db.query(`SELECT id, email, full_name, avatar_url, role, created_at, last_login_at
       FROM users WHERE id = $1`, [userId]);
        if (!user.rows[0])
            throw new common_1.NotFoundException('User not found');
        const [docs, meetings, tasks, auditLogs, apiKeys, sessions] = await Promise.all([
            this.db.query(`SELECT title, file_name, created_at FROM documents
         WHERE uploaded_by = $1 ORDER BY created_at DESC`, [userId]),
            this.db.query(`SELECT title, transcript_summary, created_at FROM meetings
         WHERE created_by = $1 ORDER BY created_at DESC`, [userId]),
            this.db.query(`SELECT title, description, status, due_date, created_at FROM tasks
         WHERE created_by = $1 ORDER BY created_at DESC`, [userId]),
            this.db.query(`SELECT action, resource_type, ip_address, created_at FROM audit_logs
         WHERE user_id = $1 ORDER BY created_at DESC`, [userId]),
            this.db.query(`SELECT name, scopes, last_used_at, created_at FROM api_keys
         WHERE user_id = $1`, [userId]),
            this.db.query(`SELECT device_name, ip_address, last_used_at FROM user_sessions
         WHERE user_id = $1`, [userId]),
        ]);
        const bundle = {
            exportedAt: new Date().toISOString(),
            exportVersion: '1.0',
            user: user.rows[0],
            documents: docs.rows,
            meetings: meetings.rows,
            tasks: tasks.rows,
            auditLogs: auditLogs.rows,
            apiKeys: apiKeys.rows,
            sessions: sessions.rows,
        };
        await this.db.query(`INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata)
       VALUES (gen_random_uuid(), $1, 'gdpr.data_export', 'user', $1, '{}')`, [userId]);
        this.logger.log(`GDPR data export completed for user ${userId}`);
        return bundle;
    }
    async requestDeletion(userId) {
        const deletionAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await this.db.query(`UPDATE users
       SET deletion_requested_at = NOW(),
           deletion_scheduled_at = $1,
           is_active = FALSE,
           updated_at = NOW()
       WHERE id = $2`, [deletionAt, userId]);
        await this.db.query(`INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata)
       VALUES (gen_random_uuid(), $1, 'gdpr.deletion_requested', 'user', $1, $2)`, [userId, JSON.stringify({ scheduledAt: deletionAt.toISOString() })]);
        this.logger.warn(`GDPR deletion requested for user ${userId}, scheduled for ${deletionAt.toISOString()}`);
        return {
            scheduledAt: new Date().toISOString(),
            deletionAt: deletionAt.toISOString(),
        };
    }
    async cancelDeletion(userId) {
        await this.db.query(`UPDATE users
       SET deletion_requested_at = NULL,
           deletion_scheduled_at = NULL,
           is_active = TRUE,
           updated_at = NOW()
       WHERE id = $1`, [userId]);
        this.logger.log(`GDPR deletion cancelled for user ${userId}`);
    }
    async purgeScheduledDeletions() {
        const due = await this.db.query(`SELECT id, email FROM users WHERE deletion_scheduled_at <= NOW() AND deletion_scheduled_at IS NOT NULL`);
        for (const user of due.rows) {
            const uid = user.id;
            await this.db.query(`UPDATE users
         SET email = $1, full_name = 'Deleted User', avatar_url = NULL,
             password_hash = '', refresh_token_hash = NULL,
             mfa_secret = NULL, is_active = FALSE,
             deletion_scheduled_at = NULL, updated_at = NOW()
         WHERE id = $2`, [`deleted_${uid}@deleted.invalid`, uid]);
            await this.db.query(`DELETE FROM user_sessions WHERE user_id = $1`, [uid]);
            await this.db.query(`DELETE FROM api_keys WHERE user_id = $1`, [uid]);
            this.logger.warn(`GDPR: user ${uid} (${user.email}) purged`);
        }
        return { purged: due.rows.length };
    }
};
exports.GdprService = GdprService;
exports.GdprService = GdprService = GdprService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        email_service_1.EmailService])
], GdprService);
//# sourceMappingURL=gdpr.service.js.map