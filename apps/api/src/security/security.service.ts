
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import type { PoolClient } from 'pg';

const ALLOWED_API_KEY_SCOPES = ['documents:read', 'tasks:read', 'projects:read'] as const;

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
    await this.db.query(
      `INSERT INTO audit_logs (
         organization_id,
         user_id,
         action,
         resource_type,
         resource_id,
         metadata,
         ip_address,
         user_agent
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
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
  }

  private async insertAuditLog(client: PoolClient, entry: AuditLogEntry) {
    await client.query(
      `INSERT INTO audit_logs (
         organization_id, user_id, action, resource_type, resource_id,
         metadata, ip_address, user_agent
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
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
  }

  async getAuditLogs(
    organizationId: string,
    filters: {
      action?: string;
      userId?: string;
      from?: string;
      to?: string;
      limit?: number;
      page?: number;
    },
  ) {
    const conditions: string[] = ['al.organization_id = $1'];
    const params: unknown[] = [organizationId];
    let idx = 2;

    if (filters.action) {
      conditions.push(`al.action ILIKE $${idx++}`);
      params.push(`%${filters.action}%`);
    }

    if (filters.userId) {
      conditions.push(`al.user_id = $${idx++}`);
      params.push(filters.userId);
    }

    if (filters.from) {
      conditions.push(`al.created_at >= $${idx++}`);
      params.push(filters.from);
    }

    if (filters.to) {
      conditions.push(`al.created_at <= $${idx++}`);
      params.push(filters.to);
    }

    const limit = Math.max(
      1,
      Math.min(
        Math.floor(filters.limit ?? 100),
        500,
      ),
    );

    params.push(limit, ((filters.page ?? 1) - 1) * limit);

    const res = await this.db.query(
      `SELECT
         al.id, al.organization_id, al.user_id, al.action, al.resource_type,
         al.resource_id, al.metadata, al.ip_address, al.created_at,
         u.name AS user_name,
         u.email AS user_email
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id AND u.organization_id = al.organization_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params,
    );

    return res.rows.map((row) => this.removeAuditSecrets(row as Record<string, unknown>));
  }

  async accessReview(organizationId: string, page: number) {
    const [members, usage] = await Promise.all([
      this.db.query(
        `SELECT u.id, u.name, u.email, u.role, u.is_active, u.mfa_enabled, u.last_login_at,
                (SELECT COUNT(*)::int FROM sessions s WHERE s.user_id = u.id AND s.is_valid AND s.expires_at > NOW()) AS sessions,
                (SELECT COUNT(*)::int FROM api_keys k WHERE k.created_by_id = u.id AND k.organization_id = $1
                  AND k.is_active AND (k.expires_at IS NULL OR k.expires_at > NOW())) AS api_keys
         FROM users u WHERE u.organization_id = $1
         ORDER BY u.is_active DESC, lower(u.name), u.id LIMIT 26 OFFSET $2`,
        [organizationId, (page - 1) * 25],
      ),
      this.db.query(
        `SELECT feature, COUNT(*)::int AS operations,
                SUM(CASE WHEN token_usage_reported THEN total_tokens ELSE 0 END)::text AS tokens
         FROM ai_usage WHERE organization_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
         GROUP BY feature ORDER BY operations DESC, feature LIMIT 20`,
        [organizationId],
      ),
    ]);
    return { members: members.rows.slice(0, 25), hasMore: members.rows.length > 25, usage: usage.rows };
  }

  private removeAuditSecrets(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.removeAuditSecrets(item));
    }
    if (!value || typeof value !== 'object') {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !/(?:secret|token|password|authorization|credential|key.?hash|raw.?key|api.?key)/i.test(key))
        .map(([key, item]) => [key, this.removeAuditSecrets(item)]),
    );
  }

  // ── API Keys ────────────────────────────────────────────────
  //
  // The canonical API-key ownership column in the database
  // is created_by_id, not user_id.

  async createApiKey(
    organizationId: string,
    userId: string,
    dto: {
      name: string;
      scopes?: string[];
      expiresAt?: string;
    },
  ) {
    const name = typeof dto.name === 'string' ? dto.name.trim() : '';
    if (!name || name.length > 100) {
      throw new BadRequestException('API key name must be between 1 and 100 characters.');
    }

    if (dto.expiresAt) {
      const expiryTimestamp = new Date(dto.expiresAt).getTime();
      if (!Number.isFinite(expiryTimestamp) || expiryTimestamp <= Date.now()) {
        throw new BadRequestException('Expiry date must be a valid date in the future.');
      }
    }

    const suppliedScopes: unknown = dto.scopes ?? [];
    if (!Array.isArray(suppliedScopes) || suppliedScopes.some((scope) => typeof scope !== 'string')) {
      throw new BadRequestException('API key scopes must be a list of supported scopes.');
    }
    const requestedScopes = Array.from(new Set(suppliedScopes as string[]));
    if (requestedScopes.length === 0) {
      throw new BadRequestException('Select at least one API key scope.');
    }
    const invalidScopes = requestedScopes.filter(
      (scope) => !ALLOWED_API_KEY_SCOPES.includes(scope as typeof ALLOWED_API_KEY_SCOPES[number]),
    );
    if (invalidScopes.length > 0) {
      throw new BadRequestException(`Invalid API key scope(s): ${invalidScopes.join(', ')}`);
    }

    const rawKey = `nxs_${crypto.randomBytes(32).toString('hex')}`;
    const prefix = rawKey.substring(0, 12);
    const keyHash = await bcrypt.hash(rawKey, 10);
    const id = uuidv4();

    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO api_keys (
           id, organization_id, created_by_id, name, key_hash,
           key_prefix, scopes, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          organizationId,
          userId,
          name,
          keyHash,
          prefix,
          requestedScopes,
          dto.expiresAt ?? null,
        ],
      );
      await this.insertAuditLog(client, {
        organizationId,
        userId,
        action: 'security.api_key.created',
        resourceType: 'api_key',
        resourceId: id,
        metadata: { name, prefix, scopes: requestedScopes, expiresAt: dto.expiresAt ?? null },
      });
    });
    // Notify the user; a mail failure must not undo key creation.
    try {
      const user = await this.db.findOne<Record<string, unknown>>(
        'users',
        { id: userId },
      );

      if (user?.email) {
        void this.emailService
          .sendApiKeyCreated(
            String(user.email),
            String(user.name ?? ''),
            name,
            prefix,
          )
          .catch((error: unknown) => {
            this.logger.warn(
              'Could not send API-key creation email.',
              error instanceof Error
                ? error.message
                : String(error),
            );
          });
      }
    } catch (error) {
      this.logger.warn(
        'API key was created, but its notification could not be prepared.',
        error instanceof Error
          ? error.message
          : String(error),
      );
    }

    // Return the plaintext key once only. Never persist it.
    return {
      id,
      name,
      key: rawKey,
      prefix,
      scopes: requestedScopes,
      expiresAt: dto.expiresAt ?? null,
      createdAt: new Date().toISOString(),
    };
  }

  async listApiKeys(organizationId: string) {
    const res = await this.db.query(
      `SELECT
         ak.id,
         ak.name,
         ak.key_prefix,
         ak.scopes,
         ak.last_used_at,
         ak.expires_at,
         ak.is_active,
         ak.created_at,
         u.name AS created_by
       FROM api_keys ak
       JOIN users u ON ak.created_by_id = u.id
       WHERE ak.organization_id = $1
         AND ak.is_active = TRUE
       ORDER BY ak.created_at DESC`,
      [organizationId],
    );

    return res.rows;
  }

  async revokeApiKey(
    organizationId: string,
    keyId: string,
    actorUserId?: string,
  ) {
    await this.db.transaction(async (client) => {
      const result = await client.query(
        `UPDATE api_keys
         SET is_active = FALSE
         WHERE id = $1
           AND organization_id = $2
           AND is_active = TRUE
         RETURNING name, key_prefix`,
        [keyId, organizationId],
      );

      const revokedKey = result.rows?.[0] as Record<string, unknown> | undefined;
      if (!revokedKey) {
        throw new NotFoundException('API key not found or already revoked');
      }

      await this.insertAuditLog(client, {
        organizationId,
        userId: actorUserId,
        action: 'security.api_key.revoked',
        resourceType: 'api_key',
        resourceId: keyId,
        metadata: {
          name: String(revokedKey.name ?? ''),
          keyPrefix: String(revokedKey.key_prefix ?? ''),
        },
      });
    });

    return { revoked: true };
  }

  async validateApiKey(
    rawKey: string,
  ): Promise<Record<string, unknown> | null> {
    if (!/^nxs_[a-f0-9]{64}$/.test(rawKey)) {
      return null;
    }

    const prefix = rawKey.substring(0, 12);

    const candidates = await this.db.query(
      `SELECT *
       FROM api_keys
       WHERE key_prefix = $1
         AND is_active = TRUE`,
      [prefix],
    );

    for (
      const candidate of candidates.rows as Record<string, unknown>[]
    ) {
      if (
        candidate.expires_at &&
        new Date(candidate.expires_at as string) < new Date()
      ) {
        continue;
      }

      const matches = await bcrypt.compare(
        rawKey,
        String(candidate.key_hash),
      );

      if (matches) {
        const active = await this.db.query(
          `UPDATE api_keys
           SET last_used_at = NOW()
           WHERE id = $1 AND organization_id = $2 AND is_active = TRUE
             AND (expires_at IS NULL OR expires_at > NOW())
           RETURNING id`,
          [candidate.id, candidate.organization_id],
        );

        if (!active.rows[0]) continue;
        const safeCandidate = { ...candidate };
        delete safeCandidate.key_hash;
        return safeCandidate;
      }
    }

    return null;
  }

  // ── Login Attempts ─────────────────────────────────────────

  async getLoginAttempts(
    organizationId: string,
    limit = 50,
  ) {
    const safeLimit = Math.max(
      1,
      Math.min(Math.floor(limit), 500),
    );

    const res = await this.db.query(
      `SELECT la.*
       FROM login_attempts la
       JOIN users u ON la.email = u.email
       WHERE u.organization_id = $1
       ORDER BY la.created_at DESC
       LIMIT $2`,
      [organizationId, safeLimit],
    );

    return res.rows;
  }

  // ── Security Summary ────────────────────────────────────────

  async getSecuritySummary(organizationId: string) {
    const [
      apiKeys,
      recentLogins,
      failedLogins,
      sessions,
    ] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*) AS count
         FROM api_keys
         WHERE organization_id = $1
           AND is_active = TRUE`,
        [organizationId],
      ),

      this.db.query(
        `SELECT COUNT(*) AS count
         FROM login_attempts la
         JOIN users u ON la.email = u.email
         WHERE u.organization_id = $1
           AND la.success = TRUE
           AND la.created_at > NOW() - INTERVAL '24 hours'`,
        [organizationId],
      ),

      this.db.query(
        `SELECT COUNT(*) AS count
         FROM login_attempts la
         JOIN users u ON la.email = u.email
         WHERE u.organization_id = $1
           AND la.success = FALSE
           AND la.created_at > NOW() - INTERVAL '24 hours'`,
        [organizationId],
      ),

      this.db.query(
        `SELECT COUNT(*) AS count
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE u.organization_id = $1
           AND s.is_valid = TRUE`,
        [organizationId],
      ),
    ]);

    const mfaAdoption = await this.db.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE mfa_enabled = TRUE
         ) AS mfa_enabled_count,
         COUNT(*) AS total_count
       FROM users
       WHERE organization_id = $1
         AND is_active = TRUE`,
      [organizationId],
    );

    const row = (
      mfaAdoption.rows[0] ?? {}
    ) as Record<string, unknown>;

    const total = Number(row.total_count ?? 0);
    const mfaCount = Number(row.mfa_enabled_count ?? 0);

    const getCount = (
      rows: Array<Record<string, unknown>>,
    ) => Number(rows[0]?.count ?? 0);

    return {
      apiKeysActive: getCount(apiKeys.rows),
      loginsLast24h: getCount(recentLogins.rows),
      failedLoginsLast24h: getCount(failedLogins.rows),
      activeSessions: getCount(sessions.rows),
      mfaAdoptionRate:
        total > 0
          ? Math.round((mfaCount / total) * 100)
          : 0,
      mfaEnabledUsers: mfaCount,
      totalUsers: total,
    };
  }
}
