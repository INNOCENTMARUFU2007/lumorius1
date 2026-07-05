import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { EmailService } from '../common/email/email.service';

export interface AuditLogEntry {
  organizationId?: string;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly emailService: EmailService,
  ) {}

  // ── Audit Logs ──────────────────────────────────────────────

  async logAudit(entry: AuditLogEntry) {
    try {
      await this.db.query(
        `INSERT INTO audit_logs
           (organization_id, user_id, action, resource_type, resource_id,
            metadata, ip_address, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          entry.organizationId ?? null,
          entry.userId ?? null,
          entry.action,
          entry.resourceType ?? null,
          entry.resourceId ?? null,
          JSON.stringify(entry.metadata ?? {}),
          entry.ipAddress ?? null,
          entry.userAgent ?? null,
        ],
      );
    } catch (err) {
      this.logger.error('Failed to write audit log', err);
    }
  }

  async getAuditLogs(
    organizationId: string,
    filters: { action?: string; userId?: string; from?: string; to?: string; limit?: number },
  ) {
    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
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
    const res = await this.db.query(
      `SELECT al.*, u.name as user_name, u.email as user_email
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY al.created_at DESC
       LIMIT ${limit}`,
      params,
    );
    return res.rows;
  }

  // ── API Keys ────────────────────────────────────────────────

  async createApiKey(
    organizationId: string,
    userId: string,
    dto: { name: string; scopes?: string[]; expiresAt?: string },
  ) {
    const rawKey = `nxs_${crypto.randomBytes(32).toString('hex')}`;
    const prefix = rawKey.substring(0, 12);
    const keyHash = await bcrypt.hash(rawKey, 10);

    const id = uuidv4();
    await this.db.query(
      `INSERT INTO api_keys
         (id, organization_id, user_id, name, key_hash, key_prefix, scopes, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        organizationId,
        userId,
        dto.name,
        keyHash,
        prefix,
        dto.scopes ?? [],
        dto.expiresAt ?? null,
      ],
    );

    // Notify user
    const user = await this.db.findOne<Record<string, unknown>>('users', { id: userId });
    if (user) {
      this.emailService.sendApiKeyCreated(
        user.email as string,
        user.name as string,
        dto.name,
        prefix,
      ).catch(() => null);
    }

    // Return key ONCE — never stored in plaintext
    return { id, name: dto.name, key: rawKey, prefix, createdAt: new Date().toISOString() };
  }

  async listApiKeys(organizationId: string) {
    const res = await this.db.query(
      `SELECT ak.id, ak.name, ak.key_prefix, ak.scopes, ak.last_used_at,
              ak.expires_at, ak.is_active, ak.created_at, u.name as created_by
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.organization_id = $1 AND ak.is_active = TRUE
       ORDER BY ak.created_at DESC`,
      [organizationId],
    );
    return res.rows;
  }

  async revokeApiKey(organizationId: string, keyId: string) {
    const result = await this.db.query(
      `UPDATE api_keys SET is_active = FALSE
       WHERE id = $1 AND organization_id = $2`,
      [keyId, organizationId],
    );
    if (result.rowCount === 0) throw new NotFoundException('API key not found');
    return { revoked: true };
  }

  async validateApiKey(rawKey: string): Promise<Record<string, unknown> | null> {
    if (!rawKey.startsWith('nxs_')) return null;
    const prefix = rawKey.substring(0, 12);

    const candidates = await this.db.query(
      `SELECT * FROM api_keys WHERE key_prefix = $1 AND is_active = TRUE`,
      [prefix],
    );

    for (const candidate of candidates.rows as Record<string, unknown>[]) {
      if (candidate.expires_at && new Date(candidate.expires_at as string) < new Date()) {
        continue;
      }
      const match = await bcrypt.compare(rawKey, candidate.key_hash as string);
      if (match) {
        await this.db.query(
          'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
          [candidate.id],
        );
        return candidate;
      }
    }
    return null;
  }

  // ── Login Attempts (security monitoring) ────────────────────

  async getLoginAttempts(organizationId: string, limit = 50) {
    const res = await this.db.query(
      `SELECT la.* FROM login_attempts la
       JOIN users u ON la.email = u.email
       WHERE u.organization_id = $1
       ORDER BY la.created_at DESC LIMIT $2`,
      [organizationId, limit],
    );
    return res.rows;
  }

  async getSecuritySummary(organizationId: string) {
    const [apiKeys, recentLogins, failedLogins, sessions] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*) as count FROM api_keys WHERE organization_id = $1 AND is_active = TRUE`,
        [organizationId],
      ),
      this.db.query(
        `SELECT COUNT(*) as count FROM login_attempts la
         JOIN users u ON la.email = u.email
         WHERE u.organization_id = $1 AND la.success = TRUE
           AND la.created_at > NOW() - INTERVAL '24 hours'`,
        [organizationId],
      ),
      this.db.query(
        `SELECT COUNT(*) as count FROM login_attempts la
         JOIN users u ON la.email = u.email
         WHERE u.organization_id = $1 AND la.success = FALSE
           AND la.created_at > NOW() - INTERVAL '24 hours'`,
        [organizationId],
      ),
      this.db.query(
        `SELECT COUNT(*) as count FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE u.organization_id = $1 AND s.is_valid = TRUE`,
        [organizationId],
      ),
    ]);

    const mfaAdoption = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE mfa_enabled) as mfa_enabled_count,
         COUNT(*) as total_count
       FROM users WHERE organization_id = $1 AND is_active = TRUE`,
      [organizationId],
    );

    const row = (mfaAdoption.rows[0] as Record<string, unknown>) ?? {};
    const total = Number(row.total_count ?? 0);
    const mfaCount = Number(row.mfa_enabled_count ?? 0);

    return {
      apiKeysActive: Number((apiKeys.rows[0] as Record<string, unknown>)?.count ?? 0),
      loginsLast24h: Number((recentLogins.rows[0] as Record<string, unknown>)?.count ?? 0),
      failedLoginsLast24h: Number((failedLogins.rows[0] as Record<string, unknown>)?.count ?? 0),
      activeSessions: Number((sessions.rows[0] as Record<string, unknown>)?.count ?? 0),
      mfaAdoptionRate: total > 0 ? Math.round((mfaCount / total) * 100) : 0,
      mfaEnabledUsers: mfaCount,
      totalUsers: total,
    };
  }
}
