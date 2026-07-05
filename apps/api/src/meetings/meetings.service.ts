import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';

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
    const meetingId = uuidv4();
    const ext = file.originalname.split('.').pop();
    const mediaType = file.mimetype.startsWith('video/') ? 'video' : 'audio';
    const storageKey = `orgs/${organizationId}/meetings/${meetingId}/recording.${ext}`;

    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    const title = opts.title || `Meeting ${new Date().toLocaleDateString()}`;
    await this.db.query(
      `INSERT INTO meetings (id, title, status, media_key, media_type, organization_id, created_by_id, team_id, scheduled_at)
       VALUES ($1, $2, 'uploading', $3, $4, $5, $6, $7, $8)`,
      [meetingId, title, storageKey, mediaType, organizationId, userId, opts.teamId ?? null, opts.scheduledAt ?? null],
    );

    await this.meetingsQueue.add('transcribe', { meetingId, organizationId }, { priority: 2 });
    return this.findById(meetingId, organizationId);
  }

  async findAll(organizationId: string, query: {
    search?: string; status?: string; teamId?: string;
    page?: number; pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions = ['m.organization_id = $1'];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (query.search) { conditions.push(`m.title ILIKE $${idx++}`); values.push(`%${query.search}%`); }
    if (query.status) { conditions.push(`m.status = $${idx++}`); values.push(query.status); }
    if (query.teamId) { conditions.push(`m.team_id = $${idx++}`); values.push(query.teamId); }

    const where = conditions.join(' AND ');

    const [countResult, dataResult] = await Promise.all([
      this.db.query<{ count: string }>(`SELECT COUNT(*) FROM meetings m WHERE ${where}`, values),
      this.db.query(
        `SELECT m.*, u.name as created_by_name,
                ma.summary, ma.sentiment,
                (SELECT COUNT(*) FROM (SELECT jsonb_array_elements(ma2.action_items) FROM meeting_analyses ma2 WHERE ma2.meeting_id = m.id) t) as action_item_count
         FROM meetings m
         LEFT JOIN users u ON m.created_by_id = u.id
         LEFT JOIN meeting_analyses ma ON m.id = ma.meeting_id
         WHERE ${where}
         ORDER BY m.created_at DESC
         LIMIT ${pageSize} OFFSET ${offset}`,
        values,
      ),
    ]);

    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0]?.count ?? '0', 10),
      page,
      pageSize,
      totalPages: Math.ceil(parseInt(countResult.rows[0]?.count ?? '0', 10) / pageSize),
    };
  }

  async findById(meetingId: string, organizationId: string) {
    const result = await this.db.query(
      `SELECT m.*, u.name as created_by_name
       FROM meetings m
       LEFT JOIN users u ON m.created_by_id = u.id
       WHERE m.id = $1 AND m.organization_id = $2`,
      [meetingId, organizationId],
    );
    if (!result.rows[0]) throw new NotFoundException('Meeting not found');
    return result.rows[0];
  }

  async getTranscript(meetingId: string, organizationId: string) {
    await this.findById(meetingId, organizationId);
    const result = await this.db.query(
      'SELECT * FROM meeting_transcripts WHERE meeting_id = $1',
      [meetingId],
    );
    return result.rows[0] ?? null;
  }

  async getAnalysis(meetingId: string, organizationId: string) {
    await this.findById(meetingId, organizationId);
    const result = await this.db.query(
      'SELECT * FROM meeting_analyses WHERE meeting_id = $1',
      [meetingId],
    );
    return result.rows[0] ?? null;
  }

  async delete(meetingId: string, organizationId: string) {
    const meeting = await this.findById(meetingId, organizationId);
    if (meeting.media_key) await this.storage.delete(meeting.media_key as string);
    await this.db.query(
      'DELETE FROM meetings WHERE id = $1 AND organization_id = $2',
      [meetingId, organizationId],
    );
    return { deleted: true };
  }
}
