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
        const meetingId = (0, uuid_1.v4)();
        const ext = file.originalname.split('.').pop();
        const mediaType = file.mimetype.startsWith('video/') ? 'video' : 'audio';
        const storageKey = `orgs/${organizationId}/meetings/${meetingId}/recording.${ext}`;
        await this.storage.upload(storageKey, file.buffer, file.mimetype);
        const title = opts.title || `Meeting ${new Date().toLocaleDateString()}`;
        await this.db.query(`INSERT INTO meetings (id, title, status, media_key, media_type, organization_id, created_by_id, team_id, scheduled_at)
       VALUES ($1, $2, 'uploading', $3, $4, $5, $6, $7, $8)`, [meetingId, title, storageKey, mediaType, organizationId, userId, opts.teamId ?? null, opts.scheduledAt ?? null]);
        await this.meetingsQueue.add('transcribe', { meetingId, organizationId }, { priority: 2 });
        return this.findById(meetingId, organizationId);
    }
    async findAll(organizationId, query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const offset = (page - 1) * pageSize;
        const conditions = ['m.organization_id = $1'];
        const values = [organizationId];
        let idx = 2;
        if (query.search) {
            conditions.push(`m.title ILIKE $${idx++}`);
            values.push(`%${query.search}%`);
        }
        if (query.status) {
            conditions.push(`m.status = $${idx++}`);
            values.push(query.status);
        }
        if (query.teamId) {
            conditions.push(`m.team_id = $${idx++}`);
            values.push(query.teamId);
        }
        const where = conditions.join(' AND ');
        const [countResult, dataResult] = await Promise.all([
            this.db.query(`SELECT COUNT(*) FROM meetings m WHERE ${where}`, values),
            this.db.query(`SELECT m.*, u.name as created_by_name,
                ma.summary, ma.sentiment,
                (SELECT COUNT(*) FROM (SELECT jsonb_array_elements(ma2.action_items) FROM meeting_analyses ma2 WHERE ma2.meeting_id = m.id) t) as action_item_count
         FROM meetings m
         LEFT JOIN users u ON m.created_by_id = u.id
         LEFT JOIN meeting_analyses ma ON m.id = ma.meeting_id
         WHERE ${where}
         ORDER BY m.created_at DESC
         LIMIT ${pageSize} OFFSET ${offset}`, values),
        ]);
        return {
            data: dataResult.rows,
            total: parseInt(countResult.rows[0]?.count ?? '0', 10),
            page,
            pageSize,
            totalPages: Math.ceil(parseInt(countResult.rows[0]?.count ?? '0', 10) / pageSize),
        };
    }
    async findById(meetingId, organizationId) {
        const result = await this.db.query(`SELECT m.*, u.name as created_by_name
       FROM meetings m
       LEFT JOIN users u ON m.created_by_id = u.id
       WHERE m.id = $1 AND m.organization_id = $2`, [meetingId, organizationId]);
        if (!result.rows[0])
            throw new common_1.NotFoundException('Meeting not found');
        return result.rows[0];
    }
    async getTranscript(meetingId, organizationId) {
        await this.findById(meetingId, organizationId);
        const result = await this.db.query('SELECT * FROM meeting_transcripts WHERE meeting_id = $1', [meetingId]);
        return result.rows[0] ?? null;
    }
    async getAnalysis(meetingId, organizationId) {
        await this.findById(meetingId, organizationId);
        const result = await this.db.query('SELECT * FROM meeting_analyses WHERE meeting_id = $1', [meetingId]);
        return result.rows[0] ?? null;
    }
    async delete(meetingId, organizationId) {
        const meeting = await this.findById(meetingId, organizationId);
        if (meeting.media_key)
            await this.storage.delete(meeting.media_key);
        await this.db.query('DELETE FROM meetings WHERE id = $1 AND organization_id = $2', [meetingId, organizationId]);
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