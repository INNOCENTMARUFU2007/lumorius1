import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const INITIAL_CURSOR_ID = '00000000-0000-0000-0000-000000000000';

interface ChangeRow {
  id: string;
  created_at: Date | string;
  event_type: string;
}

const EVENT_CATEGORIES: Record<string, string[]> = {
  'document.': ['documents', 'knowledge', 'analytics'],
  'meeting.': ['meetings', 'knowledge', 'analytics'],
  'task.': ['tasks', 'projects', 'workflows', 'analytics'],
  'project.': ['projects', 'tasks', 'workflows', 'analytics'],
  'decision.': ['decisions', 'knowledge', 'workflows'],
  'financial.': ['executive-intelligence', 'analytics'],
  'integration.': ['integrations', 'documents', 'knowledge'],
};

@Injectable()
export class LuieChangeFeedService {
  constructor(private readonly db: DatabaseService) {}

  async getChanges(
    organizationId: string,
    userId: string,
    role: string,
    sinceInput?: string,
    afterIdInput?: string,
  ) {
    const since = sinceInput ? new Date(sinceInput) : new Date(0);
    if (!Number.isFinite(since.getTime())) {
      throw new BadRequestException('The change-feed cursor timestamp is invalid.');
    }

    const afterId = afterIdInput || INITIAL_CURSOR_ID;
    if (!UUID_PATTERN.test(afterId)) {
      throw new BadRequestException('The change-feed cursor ID is invalid.');
    }

    const privileged = ['owner', 'admin', 'super_admin'].includes(String(role).toLowerCase());
    const result = await this.db.query<ChangeRow>(
      `SELECT event.id::text, event.created_at, event.event_type
         FROM luie_domain_events event
        WHERE event.organization_id = $1::uuid
          AND (event.created_at, event.id) > ($2::timestamptz, $3::uuid)
          AND (
            event.team_id IS NULL
            OR $4::boolean = TRUE
            OR EXISTS (
              SELECT 1 FROM team_members member
               WHERE member.team_id = event.team_id
                 AND member.user_id = $5::uuid
            )
          )
        ORDER BY event.created_at ASC, event.id ASC
        LIMIT 201`,
      [organizationId, since.toISOString(), afterId, privileged, userId],
    );

    const hasMore = result.rows.length > 200;
    const rows = result.rows.slice(0, 200);
    const last = rows[rows.length - 1];
    const categories = new Set<string>();

    for (const row of rows) {
      const prefix = Object.keys(EVENT_CATEGORIES)
        .find((candidate) => row.event_type.startsWith(candidate));
      for (const category of prefix ? EVENT_CATEGORIES[prefix] : ['company']) {
        categories.add(category);
      }
    }

    return {
      changed: rows.length > 0,
      categories: [...categories],
      hasMore,
      cursor: last
        ? { since: new Date(last.created_at).toISOString(), afterId: last.id }
        : { since: since.toISOString(), afterId },
    };
  }
}
