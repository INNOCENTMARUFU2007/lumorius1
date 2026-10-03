"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SecurityService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const bcrypt = __importStar(require("bcrypt"));
const crypto = __importStar(require("crypto"));
const database_service_1 = require("../database/database.service");
const email_service_1 = require("../common/email/email.service");
let SecurityService = SecurityService_1 = class SecurityService {
    constructor(db, emailService) {
        this.db = db;
        this.emailService = emailService;
        this.logger = new common_1.Logger(SecurityService_1.name);
    }
    async logAudit(entry) {
        try {
            await this.db.query(`INSERT INTO audit_logs
           (organization_id, user_id, action, resource_type, resource_id,
            metadata, ip_address, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
                entry.organizationId ?? null,
                entry.userId ?? null,
                entry.action,
                entry.resourceType ?? null,
                entry.resourceId ?? null,
                JSON.stringify(entry.metadata ?? {}),
                entry.ipAddress ?? null,
                entry.userAgent ?? null,
            ]);
        }
        catch (err) {
            this.logger.error('Failed to write audit log', err);
        }
    }
    async getAuditLogs(organizationId, filters) {
        const conditions = ['organization_id = $1'];
        const params = [organizationId];
        let idx = 2;
        if (filters.action) {
            conditions.push(`action ILIKE $${idx++}`);
            params.push(`%${filters.action}%`);
        }
        if (filters.userId) {
            conditions.push(`user_id = $${idx++}`);
            params.push(filters.userId);
        }
        if (filters.from) {
            conditions.push(`created_at >= $${idx++}`);
            params.push(filters.from);
        }
        if (filters.to) {
            conditions.push(`created_at <= $${idx++}`);
            params.push(filters.to);
        }
        const limit = Math.min(filters.limit ?? 100, 500);
        const res = await this.db.query(`SELECT al.*, u.name as user_name, u.email as user_email
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY al.created_at DESC
       LIMIT ${limit}`, params);
        return res.rows;
    }
    async createApiKey(organizationId, userId, dto) {
        const rawKey = `nxs_${crypto.randomBytes(32).toString('hex')}`;
        const prefix = rawKey.substring(0, 12);
        const keyHash = await bcrypt.hash(rawKey, 10);
        const id = (0, uuid_1.v4)();
        await this.db.query(`INSERT INTO api_keys
         (id, organization_id, user_id, name, key_hash, key_prefix, scopes, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
            id,
            organizationId,
            userId,
            dto.name,
            keyHash,
            prefix,
            dto.scopes ?? [],
            dto.expiresAt ?? null,
        ]);
        const user = await this.db.findOne('users', { id: userId });
        if (user) {
            this.emailService.sendApiKeyCreated(user.email, user.name, dto.name, prefix).catch(() => null);
        }
        return { id, name: dto.name, key: rawKey, prefix, createdAt: new Date().toISOString() };
    }
    async listApiKeys(organizationId) {
        const res = await this.db.query(`SELECT ak.id, ak.name, ak.key_prefix, ak.scopes, ak.last_used_at,
              ak.expires_at, ak.is_active, ak.created_at, u.name as created_by
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.organization_id = $1 AND ak.is_active = TRUE
       ORDER BY ak.created_at DESC`, [organizationId]);
        return res.rows;
    }
    async revokeApiKey(organizationId, keyId) {
        const result = await this.db.query(`UPDATE api_keys SET is_active = FALSE
       WHERE id = $1 AND organization_id = $2`, [keyId, organizationId]);
        if (result.rowCount === 0)
            throw new common_1.NotFoundException('API key not found');
        return { revoked: true };
    }
    async validateApiKey(rawKey) {
        if (!rawKey.startsWith('nxs_'))
            return null;
        const prefix = rawKey.substring(0, 12);
        const candidates = await this.db.query(`SELECT * FROM api_keys WHERE key_prefix = $1 AND is_active = TRUE`, [prefix]);
        for (const candidate of candidates.rows) {
            if (candidate.expires_at && new Date(candidate.expires_at) < new Date()) {
                continue;
            }
            const match = await bcrypt.compare(rawKey, candidate.key_hash);
            if (match) {
                await this.db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [candidate.id]);
                return candidate;
            }
        }
        return null;
    }
    async getLoginAttempts(organizationId, limit = 50) {
        const res = await this.db.query(`SELECT la.* FROM login_attempts la
       JOIN users u ON la.email = u.email
       WHERE u.organization_id = $1
       ORDER BY la.created_at DESC LIMIT $2`, [organizationId, limit]);
        return res.rows;
    }
    async getSecuritySummary(organizationId) {
        const [apiKeys, recentLogins, failedLogins, sessions] = await Promise.all([
            this.db.query(`SELECT COUNT(*) as count FROM api_keys WHERE organization_id = $1 AND is_active = TRUE`, [organizationId]),
            this.db.query(`SELECT COUNT(*) as count FROM login_attempts la
         JOIN users u ON la.email = u.email
         WHERE u.organization_id = $1 AND la.success = TRUE
           AND la.created_at > NOW() - INTERVAL '24 hours'`, [organizationId]),
            this.db.query(`SELECT COUNT(*) as count FROM login_attempts la
         JOIN users u ON la.email = u.email
         WHERE u.organization_id = $1 AND la.success = FALSE
           AND la.created_at > NOW() - INTERVAL '24 hours'`, [organizationId]),
            this.db.query(`SELECT COUNT(*) as count FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE u.organization_id = $1 AND s.is_valid = TRUE`, [organizationId]),
        ]);
        const mfaAdoption = await this.db.query(`SELECT
         COUNT(*) FILTER (WHERE mfa_enabled) as mfa_enabled_count,
         COUNT(*) as total_count
       FROM users WHERE organization_id = $1 AND is_active = TRUE`, [organizationId]);
        const row = mfaAdoption.rows[0] ?? {};
        const total = Number(row.total_count ?? 0);
        const mfaCount = Number(row.mfa_enabled_count ?? 0);
        return {
            apiKeysActive: Number(apiKeys.rows[0]?.count ?? 0),
            loginsLast24h: Number(recentLogins.rows[0]?.count ?? 0),
            failedLoginsLast24h: Number(failedLogins.rows[0]?.count ?? 0),
            activeSessions: Number(sessions.rows[0]?.count ?? 0),
            mfaAdoptionRate: total > 0 ? Math.round((mfaCount / total) * 100) : 0,
            mfaEnabledUsers: mfaCount,
            totalUsers: total,
        };
    }
};
exports.SecurityService = SecurityService;
exports.SecurityService = SecurityService = SecurityService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        email_service_1.EmailService])
], SecurityService);
//# sourceMappingURL=security.service.js.map