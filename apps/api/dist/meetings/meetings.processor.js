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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var MeetingsProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeetingsProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const uuid_1 = require("uuid");
const database_service_1 = require("../database/database.service");
const storage_service_1 = require("../storage/storage.service");
const ai_service_1 = require("../ai/ai.service");
const openai_1 = __importDefault(require("openai"));
const config_1 = require("@nestjs/config");
let MeetingsProcessor = MeetingsProcessor_1 = class MeetingsProcessor {
    constructor(db, storage, aiService, configService, eventEmitter) {
        this.db = db;
        this.storage = storage;
        this.aiService = aiService;
        this.configService = configService;
        this.eventEmitter = eventEmitter;
        this.logger = new common_1.Logger(MeetingsProcessor_1.name);
        this.openai = null;
        const key = this.configService.get('ai.openai.apiKey');
        if (key)
            this.openai = new openai_1.default({ apiKey: key });
    }
    async transcribeMeeting(job) {
        const { meetingId, organizationId } = job.data;
        this.logger.log(`Transcribing meeting ${meetingId}`);
        try {
            await this.db.query("UPDATE meetings SET status = 'transcribing' WHERE id = $1", [meetingId]);
            const meeting = await this.db.findOne('meetings', { id: meetingId });
            if (!meeting)
                throw new Error('Meeting not found');
            let transcriptText = '';
            if (this.openai && meeting.media_key) {
                const buffer = await this.storage.download(meeting.media_key);
                const file = await openai_1.default.toFile(buffer, "recording.mp3");
                const response = await this.openai.audio.transcriptions.create({
                    file,
                    model: 'whisper-1',
                    response_format: 'verbose_json',
                });
                transcriptText = response.text;
                await this.db.query(`INSERT INTO meeting_transcripts (id, meeting_id, content, segments, language)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (meeting_id) DO UPDATE
           SET content = EXCLUDED.content, segments = EXCLUDED.segments`, [(0, uuid_1.v4)(), meetingId, transcriptText,
                    JSON.stringify(response.segments ?? []),
                    response.language ?? 'en']);
            }
            await job.progress(60);
            await this.db.query("UPDATE meetings SET status = 'analyzing' WHERE id = $1", [meetingId]);
            const analysis = await this.analyzeTranscript(meetingId, transcriptText || 'No transcript available');
            await this.db.query(`INSERT INTO meeting_analyses (id, meeting_id, summary, action_items, decisions, key_topics, sentiment, strategic_insights)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (meeting_id) DO UPDATE
         SET summary = EXCLUDED.summary, action_items = EXCLUDED.action_items,
             decisions = EXCLUDED.decisions, key_topics = EXCLUDED.key_topics,
             sentiment = EXCLUDED.sentiment, strategic_insights = EXCLUDED.strategic_insights`, [
                (0, uuid_1.v4)(), meetingId,
                analysis.summary,
                JSON.stringify(analysis.actionItems),
                JSON.stringify(analysis.decisions),
                `{${analysis.keyTopics.join(',')}}`,
                analysis.sentiment,
                JSON.stringify(analysis.strategicInsights),
            ]);
            await this.db.query("UPDATE meetings SET status = 'completed', completed_at = NOW() WHERE id = $1", [meetingId]);
            await job.progress(100);
            this.logger.log(`Meeting ${meetingId} processed successfully`);
            this.eventEmitter.emit('meeting.completed', {
                meetingId,
                meetingTitle: meeting.title ?? 'Untitled Meeting',
                userId: meeting.created_by_id,
                organizationId,
                summary: analysis.summary ?? '',
                actionItemCount: analysis.actionItems.length,
            });
        }
        catch (error) {
            this.logger.error(`Failed to process meeting ${meetingId}`, error);
            await this.db.query("UPDATE meetings SET status = 'failed', error_message = $1 WHERE id = $2", [String(error), meetingId]);
            throw error;
        }
    }
    async analyzeTranscript(meetingId, transcript) {
        const prompt = `Analyze this meeting transcript and return a JSON object with:
{
  "summary": "3-5 sentence summary",
  "actionItems": [{"description": "...", "assignee": "...", "priority": "high|medium|low", "status": "open"}],
  "decisions": [{"description": "...", "madeBy": "...", "context": "..."}],
  "keyTopics": ["topic1", "topic2"],
  "sentiment": "positive|neutral|negative",
  "strategicInsights": ["insight1", "insight2"]
}

Transcript:
${transcript.substring(0, 12000)}`;
        const response = await this.aiService.chat([{ role: 'user', content: prompt }]);
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch)
                return JSON.parse(jsonMatch[0]);
        }
        catch { }
        return {
            summary: response.substring(0, 500),
            actionItems: [],
            decisions: [],
            keyTopics: [],
            sentiment: 'neutral',
            strategicInsights: [],
        };
    }
};
exports.MeetingsProcessor = MeetingsProcessor;
__decorate([
    (0, bull_1.Process)('transcribe'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MeetingsProcessor.prototype, "transcribeMeeting", null);
exports.MeetingsProcessor = MeetingsProcessor = MeetingsProcessor_1 = __decorate([
    (0, bull_1.Processor)('meetings'),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        storage_service_1.StorageService,
        ai_service_1.AiService,
        config_1.ConfigService,
        event_emitter_1.EventEmitter2])
], MeetingsProcessor);
//# sourceMappingURL=meetings.processor.js.map