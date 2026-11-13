import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { LuieEventPublisher } from '../luie/luie-event.publisher';

interface MeetingQuery {
  search?: string;
  status?: string;
  teamId?: string;
  page?: number;
  pageSize?: number;
}

export interface MeetingActor {
  organizationId: string;
  userId: string;
  role: string;
}

interface TextImportOptions {
  title?: string;
  content: string;
  teamId?: string;
  scheduledAt?: string;
  language?: string;
}

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    @InjectQueue('meetings') private readonly meetingsQueue: Queue,
    private readonly luiePublisher: LuieEventPublisher,
  ) {}

  private isOrgAdmin(actor: MeetingActor): boolean {
    return actor.role === 'owner' || actor.role === 'admin';
  }

  private async assertTeamAccess(teamId: string, actor: MeetingActor): Promise<void> {
    const result = await this.db.query(
      `SELECT t.id
       FROM teams t
       WHERE t.id = $1 AND t.organization_id = $2
         AND ($3::boolean = TRUE OR EXISTS (
           SELECT 1 FROM team_members tm
           WHERE tm.team_id = t.id AND tm.user_id = $4
         ))`,
      [teamId, actor.organizationId, this.isOrgAdmin(actor), actor.userId],
    );
    if (!result.rows[0]) throw new BadRequestException('The selected team is unavailable to this user.');
  }

  private validateTeamId(teamId?: string): void {
    if (teamId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId)) {
      throw new BadRequestException('Invalid meeting team ID.');
    }
  }

  private validateTitle(title?: string): void {
    if (title !== undefined && (typeof title !== 'string' || title.trim().length > 300)) {
      throw new BadRequestException('Meeting title must be a string of at most 300 characters.');
    }
  }

  private validateScheduledAt(value?: string): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.trim() === '' || !Number.isFinite(Date.parse(value))) {
      throw new BadRequestException('Invalid meeting scheduledAt value.');
    }
    return new Date(value).toISOString();
  }

  async upload(
    file: Express.Multer.File,
    actor: MeetingActor,
    opts: { title?: string; teamId?: string; scheduledAt?: string; consentConfirmed?: boolean | string },
  ) {
    if (!file?.buffer || !file.originalname) throw new BadRequestException('A valid recording file is required.');
    this.validateTitle(opts.title);
    this.validateTeamId(opts.teamId);
    if (opts.consentConfirmed !== true && opts.consentConfirmed !== 'true') {
      throw new BadRequestException('Recording upload requires explicit confirmation that the required participant consent has been obtained.');
    }
    if (opts.teamId) await this.assertTeamAccess(opts.teamId, actor);
    const scheduledAt = this.validateScheduledAt(opts.scheduledAt);

    const meetingId = uuidv4();
    const ext = file.originalname.includes('.')
      ? file.originalname.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'bin'
      : 'bin';
    const storageKey = `orgs/${actor.organizationId}/meetings/${meetingId}/recording.${ext}`;
    const title = opts.title?.trim() || `Meeting ${new Date().toISOString().slice(0, 10)}`;

    await this.storage.upload(storageKey, file.buffer, file.mimetype);
    let meetingPersisted = false;
    try {
      await this.db.transaction(async (client) => {
        await client.query(
          `INSERT INTO meetings
             (id, organization_id, created_by_id, title, status, audio_key,
              team_id, scheduled_at, processing_stage, source_type,
              consent_status, consent_captured_at, consent_captured_by)
           VALUES ($1, $2, $3, $4, 'recording', $5, $6, $7, 'queued',
                   'recording', 'granted', NOW(), $3)`,
          [meetingId, actor.organizationId, actor.userId, title, storageKey, opts.teamId ?? null, scheduledAt],
        );
        await client.query(
          `INSERT INTO meeting_intelligence_review_events
             (organization_id, meeting_id, actor_id, event_type, details)
           VALUES ($1, $2, $3, 'consent_recorded', $4::jsonb)`,
          [actor.organizationId, meetingId, actor.userId, JSON.stringify({
            method: 'uploader_attestation',
            attestationVersion: 'mi-recording-consent-v1',
          })],
        );
      });
      meetingPersisted = true;

      await this.meetingsQueue.add(
        'transcribe',
        { meetingId, organizationId: actor.organizationId },
        { jobId: `meeting-recording-${meetingId}`, priority: 2, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    } catch (error) {
      if (meetingPersisted) {
        try {
          await this.db.query(
            `UPDATE meetings SET status = 'failed', processing_stage = 'failed',
               error_message = $1, updated_at = NOW()
             WHERE id = $2 AND organization_id = $3`,
            [String(error instanceof Error ? error.message : error).slice(0, 4000), meetingId, actor.organizationId],
          );
        } catch (statusError) {
          this.logger.error(`Could not persist queue failure for meeting ${meetingId}`, statusError instanceof Error ? statusError.stack : undefined);
        }
      } else {
        try { await this.storage.delete(storageKey); }
        catch (cleanupError) {
          this.logger.error(`Could not clean up uncommitted recording ${storageKey}`, cleanupError instanceof Error ? cleanupError.stack : undefined);
        }
      }
      throw error;
    }

    return this.findById(meetingId, actor);
  }

  async importText(
    sourceType: 'transcript' | 'notes',
    input: TextImportOptions,
    actor: MeetingActor,
  ) {
    const content = typeof input.content === 'string' ? input.content : '';
    if (!content.trim()) throw new BadRequestException('Transcript or meeting notes content is required.');
    if (content.length > 1_000_000) throw new BadRequestException('Transcript or notes cannot exceed 1,000,000 characters.');
    this.validateTitle(input.title);
    this.validateTeamId(input.teamId);
    if (input.teamId) await this.assertTeamAccess(input.teamId, actor);
    const scheduledAt = this.validateScheduledAt(input.scheduledAt);
    const title = input.title?.trim() || `${sourceType === 'notes' ? 'Meeting notes' : 'Meeting transcript'} ${new Date().toISOString().slice(0, 10)}`;
    const language = typeof input.language === 'string' && input.language.trim()
      ? input.language.trim().slice(0, 32)
      : 'und';
    const meetingId = uuidv4();
    const transcriptId = uuidv4();

    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO meetings
           (id, organization_id, created_by_id, title, status, team_id,
            scheduled_at, processing_stage, source_type, consent_status, language)
         VALUES ($1, $2, $3, $4, 'processing', $5, $6, 'queued', $7, 'not_required', $8)`,
        [meetingId, actor.organizationId, actor.userId, title, input.teamId ?? null, scheduledAt, sourceType, language],
      );
      await client.query(
        `INSERT INTO meeting_transcripts (id, meeting_id, content, segments, language)
         VALUES ($1, $2, $3, '[]'::jsonb, $4)`,
        [transcriptId, meetingId, content, language],
      );
    });

    try {
      await this.meetingsQueue.add(
        'analyze-text',
        { meetingId, organizationId: actor.organizationId, actorId: actor.userId },
        { jobId: `meeting-text-${meetingId}`, priority: 2, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    } catch (error) {
      await this.db.query(
        `UPDATE meetings SET status = 'failed', processing_stage = 'failed',
           error_message = $1, updated_at = NOW()
         WHERE id = $2 AND organization_id = $3`,
        [String(error instanceof Error ? error.message : error).slice(0, 4000), meetingId, actor.organizationId],
      );
      throw error;
    }

    return this.findById(meetingId, actor);
  }

  async findAll(actor: MeetingActor, query: MeetingQuery) {
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize) || 20)));
    const offset = (page - 1) * pageSize;
    const conditions = [
      'm.organization_id = $1',
      `(m.team_id IS NULL OR $2::boolean = TRUE OR EXISTS (
         SELECT 1 FROM team_members scope_member
         WHERE scope_member.team_id = m.team_id AND scope_member.user_id = $3
       ))`,
    ];
    const values: unknown[] = [actor.organizationId, this.isOrgAdmin(actor), actor.userId];
    let idx = 4;

    if (query.search?.trim()) { conditions.push(`m.title ILIKE $${idx++}`); values.push(`%${query.search.trim()}%`); }
    if (query.status?.trim()) { conditions.push(`m.status::text = $${idx++}`); values.push(query.status.trim()); }
    if (query.teamId?.trim()) { conditions.push(`m.team_id = $${idx++}`); values.push(query.teamId.trim()); }
    const where = conditions.join(' AND ');

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM meetings m WHERE ${where}`,
      values,
    );
    const dataResult = await this.db.query(
      `SELECT m.*, u.name AS created_by_name,
              COALESCE(ma.summary, m.summary) AS summary,
              COALESCE(ma.sentiment, m.sentiment) AS sentiment,
              COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(ma.action_items) = 'array' THEN ma.action_items ELSE '[]'::jsonb END),
                       jsonb_array_length(CASE WHEN jsonb_typeof(m.action_items) = 'array' THEN m.action_items ELSE '[]'::jsonb END), 0) AS action_item_count
       FROM meetings m
       LEFT JOIN users u ON u.id = m.created_by_id AND u.organization_id = m.organization_id
       LEFT JOIN LATERAL (
         SELECT analysis.summary, analysis.sentiment, analysis.action_items
         FROM meeting_analyses analysis
         WHERE analysis.meeting_id = m.id AND analysis.organization_id = m.organization_id
         ORDER BY analysis.created_at DESC LIMIT 1
       ) ma ON TRUE
       WHERE ${where}
       ORDER BY m.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      values,
    );
    const total = Number(countResult.rows[0]?.count ?? 0);
    return { data: dataResult.rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findById(meetingId: string, actor: MeetingActor) {
    const result = await this.db.query(
      `SELECT m.*, u.name AS created_by_name
       FROM meetings m
       LEFT JOIN users u ON u.id = m.created_by_id AND u.organization_id = m.organization_id
       WHERE m.id = $1 AND m.organization_id = $2
         AND (m.team_id IS NULL OR $3::boolean = TRUE OR EXISTS (
           SELECT 1 FROM team_members tm WHERE tm.team_id = m.team_id AND tm.user_id = $4
         ))`,
      [meetingId, actor.organizationId, this.isOrgAdmin(actor), actor.userId],
    );
    if (!result.rows[0]) throw new NotFoundException('Meeting not found');
    return result.rows[0];
  }

  async getTranscript(meetingId: string, actor: MeetingActor) {
    await this.findById(meetingId, actor);
    const result = await this.db.query(
      `SELECT mt.* FROM meeting_transcripts mt
       JOIN meetings m ON m.id = mt.meeting_id
       WHERE mt.meeting_id = $1 AND m.organization_id = $2
       ORDER BY mt.created_at DESC LIMIT 1`,
      [meetingId, actor.organizationId],
    );
    return result.rows[0] ?? null;
  }

  async getAnalysis(meetingId: string, actor: MeetingActor) {
    await this.findById(meetingId, actor);
    const result = await this.db.query(
      `SELECT * FROM meeting_analyses
       WHERE meeting_id = $1 AND organization_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [meetingId, actor.organizationId],
    );
    return result.rows[0] ?? null;
  }

  async delete(meetingId: string, actor: MeetingActor) {
    const deletedAt = new Date();
    let cleanupQueued = false;
    await this.db.transaction(async (client) => {
      const meetingResult = await client.query<{
        id: string;
        title: string;
        status: string;
        audio_key: string | null;
        team_id: string | null;
      }>(
        `SELECT meeting.id, meeting.title, meeting.status, meeting.audio_key, meeting.team_id
           FROM meetings meeting
          WHERE meeting.id = $1::uuid
            AND meeting.organization_id = $2::uuid
            AND (
              meeting.team_id IS NULL
              OR $3::boolean = TRUE
              OR EXISTS (
                SELECT 1 FROM team_members member
                 WHERE member.team_id = meeting.team_id
                   AND member.user_id = $4::uuid
              )
            )
          FOR UPDATE OF meeting`,
        [meetingId, actor.organizationId, this.isOrgAdmin(actor), actor.userId],
      );
      const meeting = meetingResult.rows[0];
      if (!meeting) throw new NotFoundException('Meeting not found');

      if (meeting.audio_key) {
        await client.query(
          `INSERT INTO document_storage_cleanup_outbox
             (organization_id, document_id, meeting_id, storage_key)
           VALUES ($1::uuid, NULL, $2::uuid, $3)
           ON CONFLICT (storage_key) DO NOTHING`,
          [actor.organizationId, meetingId, meeting.audio_key],
        );
        cleanupQueued = true;
      }

      const deleted = await client.query(
        `DELETE FROM meetings
          WHERE id = $1::uuid AND organization_id = $2::uuid
          RETURNING id`,
        [meetingId, actor.organizationId],
      );
      if (!deleted.rows[0]) throw new NotFoundException('Meeting not found');

      await this.luiePublisher.append(client, {
        organizationId: actor.organizationId,
        eventKey: `meeting.deleted:${meetingId}:${deletedAt.toISOString()}`,
        eventType: 'meeting.deleted',
        aggregateType: 'meeting',
        aggregateId: meetingId,
        actorId: actor.userId,
        teamId: meeting.team_id,
        occurredAt: deletedAt,
        payload: {
          meetingId,
          title: meeting.title,
          status: meeting.status,
          recordingCleanupQueued: Boolean(meeting.audio_key),
        },
      }, ['luie.legacy-domain-bridge']);
    });

    return { deleted: true, recordingCleanup: cleanupQueued ? 'queued' : null };
  }
}