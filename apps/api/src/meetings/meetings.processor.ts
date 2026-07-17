import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { AiService } from '../ai/ai.service';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

@Processor('meetings')
export class MeetingsProcessor {
  private readonly logger = new Logger(MeetingsProcessor.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    const key = this.configService.get<string>('ai.openai.apiKey');
    if (key) this.openai = new OpenAI({ apiKey: key });
  }

  @Process('transcribe')
  async transcribeMeeting(job: Job<{ meetingId: string; organizationId: string }>) {
    const { meetingId, organizationId } = job.data;
    this.logger.log(`Transcribing meeting ${meetingId}`);

    try {
      await this.db.query(
        "UPDATE meetings SET status = 'transcribing' WHERE id = $1",
        [meetingId],
      );

      const meeting = await this.db.findOne<Record<string, unknown>>('meetings', { id: meetingId });
      if (!meeting) throw new Error('Meeting not found');

      let transcriptText = '';

      if (this.openai && meeting.media_key) {
        const buffer = await this.storage.download(meeting.media_key as string);
        const file = await OpenAI.toFile(buffer, "recording.mp3");
        const response = await this.openai.audio.transcriptions.create({
          file,
          model: 'whisper-1',
          response_format: 'verbose_json',
        });
        transcriptText = response.text;

        await this.db.query(
          `INSERT INTO meeting_transcripts (id, meeting_id, content, segments, language)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (meeting_id) DO UPDATE
           SET content = EXCLUDED.content, segments = EXCLUDED.segments`,
          [uuidv4(), meetingId, transcriptText,
           JSON.stringify((response as Record<string, unknown>).segments ?? []),
           (response as Record<string, unknown>).language ?? 'en'],
        );
      }

      await job.progress(60);

      await this.db.query(
        "UPDATE meetings SET status = 'analyzing' WHERE id = $1",
        [meetingId],
      );

      const analysis = await this.analyzeTranscript(meetingId, transcriptText || 'No transcript available');
      await this.db.query(
        `INSERT INTO meeting_analyses (id, meeting_id, summary, action_items, decisions, key_topics, sentiment, strategic_insights)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (meeting_id) DO UPDATE
         SET summary = EXCLUDED.summary, action_items = EXCLUDED.action_items,
             decisions = EXCLUDED.decisions, key_topics = EXCLUDED.key_topics,
             sentiment = EXCLUDED.sentiment, strategic_insights = EXCLUDED.strategic_insights`,
        [
          uuidv4(), meetingId,
          analysis.summary,
          JSON.stringify(analysis.actionItems),
          JSON.stringify(analysis.decisions),
          `{${analysis.keyTopics.join(',')}}`,
          analysis.sentiment,
          JSON.stringify(analysis.strategicInsights),
        ],
      );

      await this.db.query(
        "UPDATE meetings SET status = 'completed', completed_at = NOW() WHERE id = $1",
        [meetingId],
      );

      await job.progress(100);
      this.logger.log(`Meeting ${meetingId} processed successfully`);

      // Emit real-time notification event
      this.eventEmitter.emit('meeting.completed', {
        meetingId,
        meetingTitle: (meeting.title as string) ?? 'Untitled Meeting',
        userId: meeting.created_by_id as string,
        organizationId,
        summary: analysis.summary ?? '',
        actionItemCount: (analysis.actionItems as unknown[]).length,
      });
    } catch (error) {
      this.logger.error(`Failed to process meeting ${meetingId}`, error);
      await this.db.query(
        "UPDATE meetings SET status = 'failed', error_message = $1 WHERE id = $2",
        [String(error), meetingId],
      );
      throw error;
    }
  }

  private async analyzeTranscript(meetingId: string, transcript: string) {
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
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {}
    return {
      summary: response.substring(0, 500),
      actionItems: [],
      decisions: [],
      keyTopics: [],
      sentiment: 'neutral',
      strategicInsights: [],
    };
  }
}
