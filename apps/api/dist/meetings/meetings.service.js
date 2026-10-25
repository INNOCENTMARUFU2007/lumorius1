"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MeetingsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeetingsService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const uuid_1 = require("uuid");
const database_service_1 = require("../database/database.service");
const storage_service_1 = require("../storage/storage.service");
let MeetingsService = MeetingsService_1 = class MeetingsService {
    constructor(db, storage, meetingsQueue) {
        this.db = db;
        this.storage = storage;
        this.meetingsQueue = meetingsQueue;
        this.logger = new common_1.Logger(MeetingsService_1.name);
    }
    async upload(file, organizationId, userId, opts) {
        if (!file?.buffer || !file.originalname) {
            throw new common_1.BadRequestException('A valid recording file is required.');
        }
        const meetingId = (0, uuid_1.v4)();
        const ext = file.originalname.includes('.')
            ? file.originalname.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'bin'
            : 'bin';
        const storageKey = `orgs/${organizationId}/meetings/${meetingId}/recording.${ext}`;
        await this.storage.upload(storageKey, file.buffer, file.mimetype);
        const title = opts.title?.trim() || `Meeting ${new Date().toLocaleDateString()}`;
        try {
            await this.db.query(`INSERT INTO meetings (
          id,
          organization_id,
          created_by_id,
          title,
          status,
          audio_key
        )
        VALUES ($1, $2, $3, $4, 'uploading', $5)`, [meetingId, organizationId, userId, title, storageKey]);
            await this.meetingsQueue.add('transcribe', { meetingId, organizationId }, { priority: 2 });
        }
        catch (error) {
            try {
                await this.storage.delete(storageKey);
            }
            catch (cleanupError) {
                this.logger.error(`Could not clean up recording ${storageKey}`, cleanupError instanceof Error ? cleanupError.stack : undefined);
            }
            throw error;
        }
        return this.findById(meetingId, organizationId);
    }
    async findAll(organizationId, query) {
        const page = Math.max(1, Math.floor(Number(query.page) || 1));
        const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize) || 20)));
        const offset = (page - 1) * pageSize;
        const conditions = ['m.organization_id = $1'];
        const values = [organizationId];
        let idx = 2;
        if (query.search?.trim()) {
            conditions.push(`m.title ILIKE $${idx++}`);
            values.push(`%${query.search.trim()}%`);
        }
        if (query.status?.trim()) {
            conditions.push(`m.status::text = $${idx++}`);
            values.push(query.status.trim());
        }
        const where = conditions.join(' AND ');
        const countResult = await this.db.query(`SELECT COUNT(*)::text AS count
       FROM meetings m
       WHERE ${where}`, values);
        const dataResult = await this.db.query(`SELECT
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
       OFFSET ${offset}`, values);
        const total = Number(countResult.rows[0]?.count ?? 0);
        return {
            data: dataResult.rows,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }
    async findById(meetingId, organizationId) {
        const result = await this.db.query(`SELECT
         m.*,
         u.name AS created_by_name
       FROM meetings m
       LEFT JOIN users u
         ON u.id = m.created_by_id
       WHERE m.id = $1
         AND m.organization_id = $2`, [meetingId, organizationId]);
        if (!result.rows[0]) {
            throw new common_1.NotFoundException('Meeting not found');
        }
        return result.rows[0];
    }
    async getTranscript(meetingId, organizationId) {
        await this.findById(meetingId, organizationId);
        const result = await this.db.query(`SELECT *
       FROM meeting_transcripts
       WHERE meeting_id = $1
       ORDER BY created_at DESC
       LIMIT 1`, [meetingId]);
        return result.rows[0] ?? null;
    }
    async getAnalysis(meetingId, organizationId) {
        await this.findById(meetingId, organizationId);
        const result = await this.db.query(`SELECT *
       FROM meeting_analyses
       WHERE meeting_id = $1
       ORDER BY created_at DESC
       LIMIT 1`, [meetingId]);
        return result.rows[0] ?? null;
    }
    async delete(meetingId, organizationId) {
        const meeting = await this.findById(meetingId, organizationId);
        const audioKey = meeting.audio_key;
        await this.db.query(`DELETE FROM meetings
       WHERE id = $1
         AND organization_id = $2`, [meetingId, organizationId]);
        if (audioKey) {
            try {
                await this.storage.delete(audioKey);
            }
            catch (error) {
                this.logger.error(`Meeting ${meetingId} was deleted from the database, but its recording could not be removed`, error instanceof Error ? error.stack : undefined);
            }
        }
        return { deleted: true };
    }
};
exports.MeetingsService = MeetingsService;
exports.MeetingsService = MeetingsService = MeetingsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, bull_1.InjectQueue)('meetings')),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        storage_service_1.StorageService, Object])
], MeetingsService);
//# sourceMappingURL=meetings.service.js.map