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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = __importStar(require("bcrypt"));
const database_service_1 = require("../database/database.service");
let UsersService = class UsersService {
    constructor(db) {
        this.db = db;
    }
    async findAll(organizationId, query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const offset = (page - 1) * pageSize;
        const searchClause = query.search
            ? `AND (u.name ILIKE $2 OR u.email ILIKE $2)`
            : '';
        const values = [organizationId];
        if (query.search)
            values.push(`%${query.search}%`);
        const countResult = await this.db.query(`SELECT COUNT(*) FROM users u WHERE u.organization_id = $1 ${searchClause}`, values);
        const dataResult = await this.db.query(`SELECT u.id, u.email, u.name, u.avatar_url, u.role, u.is_active,
              u.mfa_enabled, u.email_verified, u.last_login_at, u.created_at
       FROM users u
       WHERE u.organization_id = $1 ${searchClause}
       ORDER BY u.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`, values);
        return {
            data: dataResult.rows,
            total: parseInt(countResult.rows[0]?.count ?? '0', 10),
            page,
            pageSize,
            totalPages: Math.ceil(parseInt(countResult.rows[0]?.count ?? '0', 10) / pageSize),
        };
    }
    async findById(userId, organizationId) {
        const result = await this.db.query(`SELECT id, email, name, avatar_url, role, is_active, mfa_enabled,
              email_verified, last_login_at, organization_id, created_at
       FROM users WHERE id = $1 AND organization_id = $2`, [userId, organizationId]);
        if (!result.rows[0])
            throw new common_1.NotFoundException('User not found');
        return result.rows[0];
    }
    async updateProfile(userId, organizationId, dto) {
        const updates = [];
        const values = [];
        let idx = 1;
        if (dto.name !== undefined) {
            updates.push(`name = $${idx++}`);
            values.push(dto.name);
        }
        if (dto.avatarUrl !== undefined) {
            updates.push(`avatar_url = $${idx++}`);
            values.push(dto.avatarUrl);
        }
        if (updates.length === 0)
            return this.findById(userId, organizationId);
        values.push(userId, organizationId);
        await this.db.query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${idx++} AND organization_id = $${idx}`, values);
        return this.findById(userId, organizationId);
    }
    async changePassword(userId, currentPassword, newPassword) {
        const user = await this.db.findOne('users', { id: userId });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (!user.password_hash)
            throw new common_1.ForbiddenException('Password login not set up');
        const valid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!valid)
            throw new common_1.ForbiddenException('Current password is incorrect');
        const hash = await bcrypt.hash(newPassword, 12);
        await this.db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
        return { changed: true };
    }
    async updateRole(targetUserId, organizationId, role, requestingUserId) {
        if (targetUserId === requestingUserId) {
            throw new common_1.ForbiddenException('Cannot change your own role');
        }
        await this.db.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3', [role, targetUserId, organizationId]);
        return this.findById(targetUserId, organizationId);
    }
    async deactivate(targetUserId, organizationId, requestingUserId) {
        if (targetUserId === requestingUserId) {
            throw new common_1.ForbiddenException('Cannot deactivate your own account');
        }
        await this.db.query('UPDATE users SET is_active = FALSE WHERE id = $1 AND organization_id = $2', [targetUserId, organizationId]);
        return { deactivated: true };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], UsersService);
//# sourceMappingURL=users.service.js.map