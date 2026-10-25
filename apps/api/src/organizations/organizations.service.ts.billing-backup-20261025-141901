
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { EmailService } from '../common/email/email.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly emailService: EmailService,
  ) {}

  // ============================================================
  // ORGANIZATION
  // ============================================================

  async findById(id: string) {
    const res = await this.db.query(
      `SELECT
         o.*,
         bp.name AS plan_name,
         COALESCE(NULLIF(bp.limits ->> 'users', '')::integer, 0) AS max_users,
         COALESCE(NULLIF(bp.limits ->> 'storage_gb', '')::numeric, 0) AS storage_gb,
         COALESCE(NULLIF(bp.limits ->> 'ai_tokens_monthly', '')::bigint, 0) AS ai_tokens_monthly
       FROM organizations o
       LEFT JOIN billing_plans bp ON o.plan_id::text = bp.id
       WHERE o.id = $1`,
      [id],
    );

    if (!res.rows[0]) {
      throw new NotFoundException('Organization not found');
    }

    return res.rows[0];
  }

  async update(
    id: string,
    dto: {
      name?: string;
      settings?: Record<string, unknown>;
    },
  ) {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(dto.name);
    }

    if (dto.settings !== undefined) {
      updates.push(`settings = $${idx++}`);
      values.push(JSON.stringify(dto.settings));
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    await this.db.query(
      `UPDATE organizations
       SET ${updates.join(', ')},
           updated_at = NOW()
       WHERE id = $${idx}`,
      values,
    );

    return this.findById(id);
  }

  // ============================================================
  // ORGANIZATION MEMBERS
  // ============================================================

  async getMembers(organizationId: string) {
    const res = await this.db.query(
      `SELECT
         id,
         email,
         name,
         avatar_url,
         role::text AS role,
         is_active,
         created_at,
         last_login_at
       FROM users
       WHERE organization_id = $1
       ORDER BY
         CASE role::text
           WHEN 'owner' THEN 0
           WHEN 'admin' THEN 1
           WHEN 'manager' THEN 2
           WHEN 'member' THEN 3
           ELSE 4
         END,
         name ASC`,
      [organizationId],
    );

    return res.rows.map((member) => ({
      ...member,
      status: member.is_active ? 'active' : 'inactive',
    }));
  }

  async removeMember(
    organizationId: string,
    userIdToRemove: string,
    requestedById: string,
  ) {
    if (userIdToRemove === requestedById) {
      throw new BadRequestException(
        'You cannot remove yourself from your organization.',
      );
    }

    const [actorResult, targetResult] = await Promise.all([
      this.db.query<{ role: string }>(
        `SELECT role::text AS role
         FROM users
         WHERE id = $1 AND organization_id = $2`,
        [requestedById, organizationId],
      ),
      this.db.query<{ id: string; role: string }>(
        `SELECT id, role::text AS role
         FROM users
         WHERE id = $1 AND organization_id = $2`,
        [userIdToRemove, organizationId],
      ),
    ]);

    const actor = actorResult.rows[0];
    const target = targetResult.rows[0];

    if (!actor) {
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    }

    if (!target) {
      throw new NotFoundException(
        'Member not found in this organization.',
      );
    }

    if (target.role === 'owner') {
      throw new ForbiddenException(
        'The organization owner cannot be removed.',
      );
    }

    const rolePriority: Record<string, number> = {
      viewer: 1,
      member: 2,
      manager: 3,
      admin: 4,
      owner: 5,
    };

    const actorPriority = rolePriority[actor.role] ?? 0;
    const targetPriority = rolePriority[target.role] ?? 0;

    if (actorPriority <= targetPriority) {
      throw new ForbiddenException(
        'You do not have sufficient permission to remove this member.',
      );
    }

    await this.db.transaction(async (client) => {
      await client.query(
        `DELETE FROM team_members tm
         USING teams t
         WHERE tm.team_id = t.id
           AND tm.user_id = $1
           AND t.organization_id = $2`,
        [userIdToRemove, organizationId],
      );

      const result = await client.query(
        `UPDATE users
         SET organization_id = NULL,
             role = 'member',
             updated_at = NOW()
         WHERE id = $1
           AND organization_id = $2
           AND role::text <> 'owner'
         RETURNING id`,
        [userIdToRemove, organizationId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(
          'Member could not be removed from this organization.',
        );
      }
    });

    return {
      removed: true,
      userId: userIdToRemove,
    };
  }

  // ============================================================
  // TEAMS
  // ============================================================

  async getTeams(organizationId: string) {
    const res = await this.db.query(
      `SELECT
         t.*,
         COUNT(tm.user_id) AS member_count,
         d.name AS department_name
       FROM teams t
       LEFT JOIN team_members tm ON t.id = tm.team_id
       LEFT JOIN departments d ON t.department_id = d.id
       WHERE t.organization_id = $1
       GROUP BY t.id, d.name
       ORDER BY t.created_at DESC`,
      [organizationId],
    );

    return res.rows;
  }

  async createTeam(
    organizationId: string,
    userId: string,
    dto: {
      name: string;
      description?: string;
      departmentId?: string;
    },
  ) {
    const name = dto.name?.trim();

    if (!name) {
      throw new BadRequestException('Team name is required.');
    }

    if (dto.departmentId) {
      const department = await this.db.query(
        `SELECT id
         FROM departments
         WHERE id = $1 AND organization_id = $2`,
        [dto.departmentId, organizationId],
      );

      if (department.rows.length === 0) {
        throw new BadRequestException(
          'The selected department does not belong to this organization.',
        );
      }
    }

    const id = uuidv4();

    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO teams
           (id, name, description, organization_id, department_id, created_by_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          name,
          dto.description ?? null,
          organizationId,
          dto.departmentId ?? null,
          userId,
        ],
      );

      await client.query(
        `INSERT INTO team_members (team_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [id, userId],
      );
    });

    return this.findTeamById(id, organizationId);
  }

  async findTeamById(id: string, organizationId: string) {
    const res = await this.db.query(
      `SELECT
         t.*,
         COUNT(tm.user_id) AS member_count
       FROM teams t
       LEFT JOIN team_members tm ON t.id = tm.team_id
       WHERE t.id = $1 AND t.organization_id = $2
       GROUP BY t.id`,
      [id, organizationId],
    );

    if (!res.rows[0]) {
      throw new NotFoundException('Team not found');
    }

    return res.rows[0];
  }

  async addTeamMember(
    teamId: string,
    organizationId: string,
    userId: string,
    role = 'member',
  ) {
    await this.findTeamById(teamId, organizationId);

    const member = await this.db.query(
      `SELECT id
       FROM users
       WHERE id = $1 AND organization_id = $2`,
      [userId, organizationId],
    );

    if (member.rows.length === 0) {
      throw new NotFoundException(
        'User not found in this organization.',
      );
    }

    const allowedRoles = ['member', 'manager', 'viewer'];

    if (!allowedRoles.includes(role)) {
      throw new BadRequestException('Invalid team-member role.');
    }

    await this.db.query(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (team_id, user_id)
       DO UPDATE SET role = EXCLUDED.role`,
      [teamId, userId, role],
    );

    return { added: true };
  }

  // ============================================================
  // DEPARTMENTS
  // ============================================================

  async getDepartments(organizationId: string) {
    const res = await this.db.query(
      `SELECT
         d.*,
         u.name AS head_name,
         COUNT(t.id) AS team_count
       FROM departments d
       LEFT JOIN users u ON d.head_user_id = u.id
       LEFT JOIN teams t ON t.department_id = d.id
       WHERE d.organization_id = $1
       GROUP BY d.id, u.name
       ORDER BY d.name`,
      [organizationId],
    );

    return res.rows;
  }

  async createDepartment(
    organizationId: string,
    dto: {
      name: string;
      description?: string;
      headUserId?: string;
    },
  ) {
    const name = dto.name?.trim();

    if (!name) {
      throw new BadRequestException('Department name is required.');
    }

    if (dto.headUserId) {
      const head = await this.db.query(
        `SELECT id
         FROM users
         WHERE id = $1 AND organization_id = $2`,
        [dto.headUserId, organizationId],
      );

      if (head.rows.length === 0) {
        throw new BadRequestException(
          'The department head must belong to this organization.',
        );
      }
    }

    const id = uuidv4();

    await this.db.query(
      `INSERT INTO departments
         (id, name, description, organization_id, head_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        name,
        dto.description ?? null,
        organizationId,
        dto.headUserId ?? null,
      ],
    );

    return this.db.findOne('departments', { id });
  }

  // ============================================================
  // INVITATIONS
  // ============================================================

  async getInvitationHistory(organizationId: string) {
    const res = await this.db.query(
      `SELECT
         i.id,
         i.email,
         i.role,
         i.team_id,
         i.created_at,
         i.expires_at,
         i.accepted_at,
         CASE
           WHEN i.accepted_at IS NOT NULL THEN 'accepted'
           WHEN i.expires_at <= NOW() THEN 'expired'
           ELSE 'pending'
         END AS status
       FROM invitations i
       WHERE i.organization_id = $1
       ORDER BY i.created_at DESC`,
      [organizationId],
    );

    return res.rows;
  }

  async invite(
    organizationId: string,
    invitedById: string,
    dto: {
      email: string;
      role?: string;
      teamId?: string;
    },
  ) {
    const email =
      typeof dto.email === 'string'
        ? dto.email.trim().toLowerCase()
        : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException(
        'A valid email address is required.',
      );
    }

    const role = dto.role?.trim().toLowerCase() || 'member';

    const rolePriority: Record<string, number> = {
      viewer: 1,
      member: 2,
      manager: 3,
      admin: 4,
      owner: 5,
    };

    if (
      !Object.prototype.hasOwnProperty.call(rolePriority, role) ||
      role === 'owner'
    ) {
      throw new BadRequestException('Invalid invitation role.');
    }

    const inviterResult = await this.db.query<{ role: string }>(
      `SELECT role::text AS role
       FROM users
       WHERE id = $1 AND organization_id = $2`,
      [invitedById, organizationId],
    );

    const inviterRole = inviterResult.rows[0]?.role;

    if (!inviterRole) {
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    }

    if (rolePriority[role] >= (rolePriority[inviterRole] ?? 0)) {
      throw new ForbiddenException(
        'You cannot invite someone with an equal or higher role.',
      );
    }

    const existingResult = await this.db.query<{
      id: string;
      organization_id: string | null;
    }>(
      `SELECT id, organization_id
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email],
    );

    const existing = existingResult.rows[0];

    if (existing?.organization_id === organizationId) {
      throw new ConflictException(
        'User is already a member of this organization.',
      );
    }

    if (existing?.organization_id) {
      throw new ConflictException(
        'This account already belongs to another organization.',
      );
    }

    if (dto.teamId) {
      const teamResult = await this.db.query(
        `SELECT id
         FROM teams
         WHERE id = $1 AND organization_id = $2`,
        [dto.teamId, organizationId],
      );

      if (teamResult.rows.length === 0) {
        throw new BadRequestException(
          'The selected team does not belong to this organization.',
        );
      }
    }

    const existingInvite = await this.db.query(
      `SELECT id
       FROM invitations
       WHERE LOWER(email) = LOWER($1)
         AND organization_id = $2
         AND accepted_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [email, organizationId],
    );

    if (existingInvite.rows.length > 0) {
      throw new ConflictException(
        'An active invitation already exists for this email.',
      );
    }

    const token = uuidv4();
    const invitationId = uuidv4();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await this.db.query(
      `INSERT INTO invitations
         (id, email, role, organization_id, invited_by_id,
          team_id, token, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        invitationId,
        email,
        role,
        organizationId,
        invitedById,
        dto.teamId ?? null,
        token,
        expiresAt,
      ],
    );

    const org = await this.findById(organizationId);
    const inviter = await this.db.findOne<Record<string, unknown>>(
      'users',
      { id: invitedById },
    );

    try {
      await this.emailService.sendTeamInvitation(
        email,
        (inviter?.name ?? 'Someone') as string,
        org.name as string,
        token,
      );
    } catch (error) {
      await this.db.query(
        `DELETE FROM invitations
         WHERE id = $1 AND accepted_at IS NULL`,
        [invitationId],
      );

      throw error;
    }

    return { sent: true, email };
  }

  // ============================================================
  // ACCEPT INVITATION
  // ============================================================

  async acceptInvitation(token: string, userId: string) {
    const invite = await this.db.findOne<Record<string, unknown>>(
      'invitations',
      { token },
    );

    if (!invite || invite.accepted_at) {
      throw new NotFoundException(
        'Invitation not found or already used.',
      );
    }

    if (new Date(invite.expires_at as string).getTime() <= Date.now()) {
      throw new BadRequestException('Invitation expired.');
    }

    const user = await this.db.findOne<Record<string, unknown>>(
      'users',
      { id: userId },
    );

    if (!user || user.is_active === false) {
      throw new NotFoundException('User not found or inactive.');
    }

    const userEmail = String(user.email ?? '').trim().toLowerCase();
    const invitationEmail = String(invite.email ?? '')
      .trim()
      .toLowerCase();

    if (!userEmail || userEmail !== invitationEmail) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address.',
      );
    }

    if (user.organization_id) {
      if (user.organization_id === invite.organization_id) {
        throw new ConflictException(
          'You already belong to this organization.',
        );
      }

      throw new ConflictException(
        'This account already belongs to another organization.',
      );
    }

    await this.db.transaction(async (client) => {
      const lockedResult = await client.query<Record<string, unknown>>(
        `SELECT
           id, email, role, organization_id, team_id,
           accepted_at, expires_at
         FROM invitations
         WHERE id = $1
         FOR UPDATE`,
        [invite.id],
      );

      const lockedInvite = lockedResult.rows[0];

      if (!lockedInvite || lockedInvite.accepted_at) {
        throw new ConflictException(
          'This invitation has already been used.',
        );
      }

      if (
        new Date(lockedInvite.expires_at as string).getTime() <=
        Date.now()
      ) {
        throw new BadRequestException('Invitation expired.');
      }

      const userUpdate = await client.query(
        `UPDATE users
         SET organization_id = $1,
             role = $2,
             updated_at = NOW()
         WHERE id = $3
           AND organization_id IS NULL
           AND LOWER(email) = LOWER($4)
         RETURNING id`,
        [
          lockedInvite.organization_id,
          lockedInvite.role,
          userId,
          lockedInvite.email,
        ],
      );

      if (userUpdate.rows.length === 0) {
        throw new ConflictException(
          'This account cannot accept the invitation. Check that it is not already assigned to an organization.',
        );
      }

      const acceptedUpdate = await client.query(
        `UPDATE invitations
         SET accepted_at = NOW()
         WHERE id = $1 AND accepted_at IS NULL
         RETURNING id`,
        [lockedInvite.id],
      );

      if (acceptedUpdate.rows.length === 0) {
        throw new ConflictException(
          'This invitation has already been used.',
        );
      }

      if (lockedInvite.team_id) {
        await client.query(
          `INSERT INTO team_members (team_id, user_id, role)
           VALUES ($1, $2, 'member')
           ON CONFLICT (team_id, user_id) DO NOTHING`,
          [lockedInvite.team_id, userId],
        );
      }
    });

    return { accepted: true };
  }

  // ============================================================
  // USAGE
  // ============================================================

  async getUsage(organizationId: string) {
    const [orgRes, userRes] = await Promise.all([
      this.db.query(
        `SELECT
           COALESCE(NULLIF(bp.limits ->> 'users', '')::integer, 0) AS max_users,
           COALESCE(NULLIF(bp.limits ->> 'storage_gb', '')::numeric, 0) AS storage_gb,
           COALESCE(NULLIF(bp.limits ->> 'ai_tokens_monthly', '')::bigint, 0) AS ai_tokens_monthly,
           COALESCE(
             (SELECT SUM(d.size_bytes)
              FROM documents d
              WHERE d.organization_id = o.id), 0
           ) AS storage_used_bytes,
           COALESCE(
             (SELECT SUM(au.total_tokens)
              FROM ai_usage au
              WHERE au.organization_id = o.id
                AND au.created_at >= date_trunc('month', NOW())), 0
           ) AS ai_tokens_used
         FROM organizations o
         JOIN billing_plans bp ON o.plan_id::text = bp.id
         WHERE o.id = $1`,
        [organizationId],
      ),
      this.db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM users
         WHERE organization_id = $1 AND is_active = TRUE`,
        [organizationId],
      ),
    ]);

    if (!orgRes.rows[0]) {
      throw new NotFoundException('Organization not found');
    }

    const org = orgRes.rows[0] as Record<string, unknown>;
    const userCount = Number(userRes.rows[0]?.count ?? 0);

    return {
      users: {
        used: userCount,
        limit: Number(org.max_users),
      },
      storage: {
        usedGb: Number(org.storage_used_bytes) / 1024 ** 3,
        limitGb: Number(org.storage_gb),
      },
      aiRequests: {
        used: Number(org.ai_tokens_used),
        limit: Number(org.ai_tokens_monthly),
      },
    };
  }

  // ============================================================
  // ONBOARDING
  // ============================================================

  async completeOnboarding(
    userId: string,
    dto: {
      orgName?: string;
      orgSize?: string;
      industry?: string;
      invites?: string;
      brainDesc?: string;
      goalTitle?: string;
    },
  ) {
    const user = await this.db.findOne<Record<string, unknown>>(
      'users',
      { id: userId },
    );

    if (!user || user.is_active === false) {
      throw new NotFoundException('User not found');
    }

    if (!user.email_verified) {
      throw new ForbiddenException(
        'Please verify your email before completing onboarding.',
      );
    }

    const requestedOrgName = dto.orgName?.trim() ?? '';
    let organizationId = user.organization_id as string | null;

    if (!organizationId && !requestedOrgName) {
      throw new BadRequestException('Organization name is required.');
    }

    const onboardingData = {
      completed: true,
      completedAt: new Date().toISOString(),
      orgSize: dto.orgSize ?? null,
      industry: dto.industry?.trim() ?? null,
      brainDesc: dto.brainDesc?.trim() ?? null,
      goalTitle: dto.goalTitle?.trim() ?? null,
      invites: dto.invites?.trim() ?? '',
    };

    await this.db.transaction(async (client) => {
      if (!organizationId) {
        organizationId = uuidv4();

        const slugBase =
          requestedOrgName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 60) || 'workspace';

        const slug = `${slugBase}-${uuidv4().slice(0, 8)}`;

        await client.query(
          `INSERT INTO organizations
             (id, name, slug, plan_id, settings)
           VALUES ($1, $2, $3, 'free', $4)`,
          [
            organizationId,
            requestedOrgName,
            slug,
            JSON.stringify({ onboarding: onboardingData }),
          ],
        );

        await client.query(
          `UPDATE users
           SET organization_id = $1,
               role = 'owner',
               onboarding_completed = TRUE,
               updated_at = NOW()
           WHERE id = $2`,
          [organizationId, userId],
        );
      } else {
        await client.query(
          `UPDATE organizations
           SET name = CASE
                 WHEN $1::text IS NULL OR BTRIM($1::text) = ''
                 THEN name
                 ELSE $1
               END,
               settings = COALESCE(settings, '{}'::jsonb) || $2::jsonb,
               updated_at = NOW()
           WHERE id = $3`,
          [
            requestedOrgName || null,
            JSON.stringify({ onboarding: onboardingData }),
            organizationId,
          ],
        );

        await client.query(
          `UPDATE users
           SET onboarding_completed = TRUE,
               updated_at = NOW()
           WHERE id = $1`,
          [userId],
        );
      }
    });

    return {
      completed: true,
      onboardingCompleted: true,
    };
  }
}
