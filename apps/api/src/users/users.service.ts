import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(organizationId: string, query: { search?: string; page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const searchClause = query.search
      ? `AND (u.name ILIKE $2 OR u.email ILIKE $2)`
      : '';
    const values: unknown[] = [organizationId];
    if (query.search) values.push(`%${query.search}%`);

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM users u WHERE u.organization_id = $1 ${searchClause}`,
      values,
    );

    const dataResult = await this.db.query(
      `SELECT u.id, u.email, u.name, u.avatar_url, u.role, u.is_active,
              u.mfa_enabled, u.email_verified, u.last_login_at, u.created_at
       FROM users u
       WHERE u.organization_id = $1 ${searchClause}
       ORDER BY u.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      values,
    );

    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0]?.count ?? '0', 10),
      page,
      pageSize,
      totalPages: Math.ceil(parseInt(countResult.rows[0]?.count ?? '0', 10) / pageSize),
    };
  }

  async findById(userId: string, organizationId: string) {
    const result = await this.db.query(
      `SELECT id, email, name, avatar_url, role, is_active, mfa_enabled,
              email_verified, last_login_at, organization_id, created_at
       FROM users WHERE id = $1 AND organization_id = $2`,
      [userId, organizationId],
    );
    if (!result.rows[0]) throw new NotFoundException('User not found');
    return result.rows[0];
  }

  async updateProfile(
    userId: string,
    organizationId: string,
    dto: { name?: string; avatarUrl?: string },
  ) {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) { updates.push(`name = $${idx++}`); values.push(dto.name); }
    if (dto.avatarUrl !== undefined) { updates.push(`avatar_url = $${idx++}`); values.push(dto.avatarUrl); }

    if (updates.length === 0) return this.findById(userId, organizationId);

    values.push(userId, organizationId);
    await this.db.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${idx++} AND organization_id = $${idx}`,
      values,
    );
    return this.findById(userId, organizationId);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.db.findOne<Record<string, unknown>>('users', { id: userId });
    if (!user) throw new NotFoundException('User not found');
    if (!user.password_hash) throw new ForbiddenException('Password login not set up');

    const valid = await bcrypt.compare(currentPassword, user.password_hash as string);
    if (!valid) throw new ForbiddenException('Current password is incorrect');

    const hash = await bcrypt.hash(newPassword, 12);
    await this.db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    return { changed: true };
  }

  async updateRole(
    targetUserId: string,
    organizationId: string,
    role: string,
    requestingUserId: string,
  ) {
    if (targetUserId === requestingUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }
    await this.db.query(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3',
      [role, targetUserId, organizationId],
    );
    return this.findById(targetUserId, organizationId);
  }

  async deactivate(targetUserId: string, organizationId: string, requestingUserId: string) {
    if (targetUserId === requestingUserId) {
      throw new ForbiddenException('Cannot deactivate your own account');
    }
    await this.db.query(
      'UPDATE users SET is_active = FALSE WHERE id = $1 AND organization_id = $2',
      [targetUserId, organizationId],
    );
    return { deactivated: true };
  }
}
