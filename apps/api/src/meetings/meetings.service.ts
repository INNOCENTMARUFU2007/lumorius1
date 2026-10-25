
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

interface MeetingQuery {
  search?: string;
  status?: string;
  teamId?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    @InjectQueue('meetings') private readonly meetingsQueue: Queue,
  ) {}

  async upload(
    file: Express.Multer.File,
    organizationId: string,
    userId: string,
    opts: { title?: string; teamId?: string; scheduledAt?: string },
  ) {
    if (!file?.buffer || !file.originalname) {
      throw new BadRequestException('A valid recording file is required.');
    }

    const meetingId = uuidv4();
    const ext = file.originalname.includes('.')
      ? file.originalname.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'bin'
      : 'bin';

    const storageKey =
      `orgs/${organizationId}/meetings/${meetingId}/recording.${ext}`;

    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    const title =
      opts.title?.trim() || `Meeting ${new Date().toLocaleDateString()}`;

    try {
      await this.db.query(
        `INSERT INTO meetings (
          id,
          organization_id,
          created_by_id,
          title,
          status,
          audio_key
        )
        VALUES ($1, $2, $3, $4, 'uploading', $5)`,
        [meetingId, organizationId, userId, title, storageKey],
      );

      await this.meetingsQueue.add(
        'transcribe',
        { meetingId, organizationId },
        { priority: 2 },
      );
    } catch (error) {
      // Avoid leaving an orphaned recording if database insertion fails.
      try {
        await this.storage.delete(storageKey);
      } catch (cleanupError) {
        this.logger.error(
          `Could not clean up recording ${storageKey}`,
          cleanupError instanceof Error ? cleanupError.stack : undefined,
        );
      }

      throw error;
    }

    return this.findById(meetingId, organizationId);
  }

  async findAll(organizationId: string, query: MeetingQuery) {
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Math.floor(Number(query.pageSize) || 20)),
    );
    const offset = (page - 1) * pageSize;

    const conditions = ['m.organization_id = $1'];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (query.search?.trim()) {
      conditions.push(`m.title ILIKE $${idx++}`);
      values.push(`%${query.search.trim()}%`);
    }

    if (query.status?.trim()) {
      conditions.push(`m.status::text = $${idx++}`);
      values.push(query.status.trim());
    }

    // The verified meetings table has no team_id column.
    // Ignore teamId until team membership is represented in the schema.
    const where = conditions.join(' AND ');

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM meetings m
       WHERE ${where}`,
      values,
    );

    const dataResult = await this.db.query(
      `SELECT
         m.*,
         u.name AS created_by_name,
         COALESCE(ma.summary, m.summary) AS summary,
         COALESCE(ma.sentiment, m.sentiment) AS sentiment,
         COALESCE(
           jsonb_array_length(
             CASE
               WHEN jsonb_typeof(ma.action_items) = 'array'
                 THEN ma.action_items
               ELSE '[]'::jsonb
             END
           ),
           jsonb_array_length(
             CASE
               WHEN jsonb_typeof(m.action_items) = 'array'
                 THEN m.action_items
               ELSE '[]'::jsonb
             END
           ),
           0
         ) AS action_item_count
       FROM meetings m
       LEFT JOIN users u
         ON u.id = m.created_by_id
       LEFT JOIN LATERAL (
         SELECT
           analysis.summary,
           analysis.sentiment,
           analysis.action_items
         FROM meeting_analyses analysis
         WHERE analysis.meeting_id = m.id
         ORDER BY analysis.created_at DESC
         LIMIT 1
       ) ma ON TRUE
       WHERE ${where}
       ORDER BY m.created_at DESC
       LIMIT ${pageSize}
       OFFSET ${offset}`,
      values,
    );

    const total = Number(countResult.rows[0]?.count ?? 0);

    return {
      data: dataResult.rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findById(meetingId: string, organizationId: string) {
    const result = await this.db.query(
      `SELECT
         m.*,
         u.name AS created_by_name
       FROM meetings m
       LEFT JOIN users u
         ON u.id = m.created_by_id
       WHERE m.id = $1
         AND m.organization_id = $2`,
      [meetingId, organizationId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Meeting not found');
    }

    return result.rows[0];
  }

  async getTranscript(meetingId: string, organizationId: string) {
    await this.findById(meetingId, organizationId);

    const result = await this.db.query(
      `SELECT *
       FROM meeting_transcripts
       WHERE meeting_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [meetingId],
    );

    return result.rows[0] ?? null;
  }

  async getAnalysis(meetingId: string, organizationId: string) {
    await this.findById(meetingId, organizationId);

    const result = await this.db.query(
      `SELECT *
       FROM meeting_analyses
       WHERE meeting_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [meetingId],
    );

    return result.rows[0] ?? null;
  }

  async delete(meetingId: string, organizationId: string) {
    const meeting = await this.findById(meetingId, organizationId);

    const audioKey = meeting.audio_key as string | null;

    await this.db.query(
      `DELETE FROM meetings
       WHERE id = $1
         AND organization_id = $2`,
      [meetingId, organizationId],
    );

    if (audioKey) {
      try {
        await this.storage.delete(audioKey);
      } catch (error) {
        this.logger.error(
          `Meeting ${meetingId} was deleted from the database, but its recording could not be removed`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return { deleted: true };
  }
}
