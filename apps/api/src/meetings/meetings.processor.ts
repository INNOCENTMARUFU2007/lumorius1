import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { v4 as uuidv4 } from 'uuid';

import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { AiService } from '../ai/ai.service';
import { MeetingIntelligenceService } from './meeting-intelligence.service';
import { LuieEventPublisher } from '../luie/luie-event.publisher';

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
    private readonly luiePublisher: LuieEventPublisher,
    private readonly meetingIntelligence: MeetingIntelligenceService,
  ) {
    const key =
      this.configService.get<string>('ai.openai.apiKey') ??
      process.env.OPENAI_API_KEY;

    if (key) {
      this.openai = new OpenAI({ apiKey: key });
    }
  }

  private async commitMeetingCompletion(input: {
    meetingId: string;
    organizationId: string;
    meetingTitle: string;
    teamId: string | null;
    actorId: string | null;
    userId: string | null;
    jobId: string;
    jobTimestamp: number;
  }): Promise<void> {
    if (!input.jobId || input.jobId.length > 100 || !Number.isSafeInteger(input.jobTimestamp) || input.jobTimestamp <= 0) {
      throw new Error('Meeting job is missing a valid, stable Bull job identity.');
    }
    const occurredAt = new Date(input.jobTimestamp);
    await this.db.transaction(async (client) => {
      const completed = await client.query(
        `UPDATE meetings
            SET status = 'completed',
                processing_stage = 'review',
                completed_at = NOW(),
                error_message = NULL,
                updated_at = NOW()
          WHERE id = $1 AND organization_id = $2
          RETURNING id, team_id`,
        [input.meetingId, input.organizationId],
      );
      if (!completed.rows[0]) {
        throw new Error('Meeting could not be marked completed in its organisation.');
      }
      const teamId = typeof completed.rows[0].team_id === 'string'
        ? completed.rows[0].team_id
        : input.teamId;
      await this.luiePublisher.append(client, {
        organizationId: input.organizationId,
        eventKey: `meeting.completed:${input.meetingId}:${input.jobId}:${input.jobTimestamp}`,
        eventType: 'meeting.completed',
        aggregateType: 'meeting',
        aggregateId: input.meetingId,
        actorId: input.actorId,
        teamId,
        occurredAt,
        payload: {
          meetingId: input.meetingId,
          meetingTitle: input.meetingTitle,
          actorId: input.actorId,
          userId: input.userId,
          organizationId: input.organizationId,
          teamId,
        },
      }, ['luie.legacy-domain-bridge']);
    });
  }

  @Process('transcribe')
  async transcribeMeeting(
    job: Job<{
      meetingId: string;
      organizationId: string;
    }>,
  ) {
    const { meetingId, organizationId } = job.data;

    if (!meetingId || !organizationId) {
      throw new Error(
        'Meeting processing requires both meetingId and organizationId.',
      );
    }

    this.logger.log(`Transcribing meeting ${meetingId}`);

    try {
      // Every worker operation is scoped to the organisation in the job.
      const statusResult = await this.db.query(
        `UPDATE meetings
         SET status = 'processing',
             processing_stage = 'transcription',
             error_message = NULL
         WHERE id = $1
           AND organization_id = $2
         RETURNING id`,
        [meetingId, organizationId],
      );

      if (!statusResult.rows[0]) {
        throw new Error(
          'Meeting not found in the specified organisation.',
        );
      }

      const meetingResult = await this.db.query<Record<string, unknown>>(
        `SELECT
           id,
           organization_id,
           title,
           created_by_id,
           team_id,
           audio_key,
           consent_status,
           consent_captured_at,
           consent_captured_by,
           EXISTS (
             SELECT 1 FROM meeting_intelligence_review_events consent_event
             WHERE consent_event.organization_id = meetings.organization_id
               AND consent_event.meeting_id = meetings.id
               AND consent_event.actor_id = meetings.consent_captured_by
               AND consent_event.event_type = 'consent_recorded'
           ) AS consent_audit_present,
           source_type
         FROM meetings
         WHERE id = $1
           AND organization_id = $2
         LIMIT 1`,
        [meetingId, organizationId],
      );

      const meeting = meetingResult.rows[0];

      if (!meeting) {
        throw new Error(
          'Meeting not found in the specified organisation.',
        );
      }

      if (meeting.source_type === 'recording' && (
        meeting.consent_status !== 'granted' ||
        !meeting.consent_captured_at ||
        !meeting.consent_captured_by ||
        meeting.consent_audit_present !== true
      )) {
        throw new Error('Recording transcription is blocked because required participant consent or its audit record is missing.');
      }

      // MeetingsService.upload persists the recording path in audio_key.
      const audioKey =
        typeof meeting.audio_key === 'string'
          ? meeting.audio_key.trim()
          : '';

      if (!audioKey) {
        throw new Error(
          'Meeting recording reference is missing from audio_key.',
        );
      }

      if (!this.openai) {
        throw new Error(
          'OpenAI transcription is not configured. Set OPENAI_API_KEY before processing recordings.',
        );
      }

      const buffer = await this.storage.download(audioKey);

      if (!buffer || buffer.length === 0) {
        throw new Error(
          'The meeting recording is empty or could not be downloaded.',
        );
      }

      // Preserve the uploaded file extension instead of labelling every
      // recording as an MP3 file.
      const filename = audioKey.split('/').pop() || 'recording.bin';
      const file = await OpenAI.toFile(buffer, filename);

      const transcription =
        await this.openai.audio.transcriptions.create({
          file,
          model: 'whisper-1',
          response_format: 'verbose_json',
        });

      // Whisper verbose_json reports the audio duration. Segment end times are
      // a fallback; when neither is present, retain null rather than guessing.
      const transcriptionMetadata = transcription as unknown as {
        duration?: number;
        segments?: Array<{ end?: number }>;
      };
      const reportedDuration = Number(transcriptionMetadata.duration);
      const segmentEnds = (transcriptionMetadata.segments ?? [])
        .map((segment) => Number(segment.end))
        .filter((value) => Number.isFinite(value) && value > 0);
      const segmentDuration = segmentEnds.reduce(
        (maximum, value) => Math.max(maximum, value),
        0,
      );
      const audioDurationSeconds =
        Number.isFinite(reportedDuration) && reportedDuration > 0
          ? Math.ceil(reportedDuration)
          : segmentDuration > 0
            ? Math.ceil(segmentDuration)
            : null;
      const transcriptionUserId =
        typeof meeting.created_by_id === 'string'
          ? meeting.created_by_id
          : undefined;

      // A stable operation key prevents a Bull retry from double-counting the
      // same meeting transcription in the usage ledger.
      await this.aiService.recordAudioTranscriptionUsage({
        meetingId,
        organizationId,
        userId: transcriptionUserId,
        audioDurationSeconds,
        operationKey: `meeting.transcription:${meetingId}:${String(job.id)}`,
      });

      if (audioDurationSeconds !== null) {
        await this.db.query(
          `UPDATE meetings
              SET duration_seconds = $1,
                  updated_at = NOW()
            WHERE id = $2
              AND organization_id = $3`,
          [audioDurationSeconds, meetingId, organizationId],
        );
      }

      const transcriptText =
        typeof transcription.text === 'string'
          ? transcription.text.trim()
          : '';

      if (!transcriptText) {
        throw new Error(
          'Transcription completed without producing usable text.',
        );
      }

      await this.db.query(
        `INSERT INTO meeting_transcripts
           (
             id,
             meeting_id,
             content,
             segments,
             language
           )
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (meeting_id)
         DO UPDATE SET
           content = EXCLUDED.content,
           segments = EXCLUDED.segments,
           language = EXCLUDED.language`,
        [
          uuidv4(),
          meetingId,
          transcriptText,
          JSON.stringify(transcription.segments ?? []),
          transcription.language ?? 'en',
        ],
      );

      await job.progress(60);

      const analyzingResult = await this.db.query(
        `UPDATE meetings
         SET status = 'processing',
             processing_stage = 'analysis'
         WHERE id = $1
           AND organization_id = $2
         RETURNING id`,
        [meetingId, organizationId],
      );

      if (!analyzingResult.rows[0]) {
        throw new Error(
          'Meeting was removed before analysis could begin.',
        );
      }

      const userId =
        typeof meeting.created_by_id === 'string'
          ? meeting.created_by_id
          : undefined;

      const analysis = await this.meetingIntelligence.processTranscript({
        meetingId,
        organizationId,
        userId,
      });
      await this.commitMeetingCompletion({
        meetingId,
        organizationId,
        meetingTitle: typeof meeting.title === 'string' ? meeting.title : 'Untitled Meeting',
        teamId: typeof meeting.team_id === 'string' ? meeting.team_id : null,
        actorId: userId ?? null,
        userId: userId ?? null,
        jobId: String(job.id ?? ''),
        jobTimestamp: Number(job.timestamp),
      });
      void analysis;

      await job.progress(100).catch((progressError: unknown) => { this.logger.warn(`Meeting ${meetingId} completed, but progress reporting failed: ${progressError instanceof Error ? progressError.message : String(progressError)}`); });
      this.logger.log(`Meeting ${meetingId} processed successfully`);


    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to process meeting ${meetingId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Never allow a worker to change a meeting belonging to another org.
      try {
        await this.db.query(
          `UPDATE meetings
           SET status = 'failed',
               processing_stage = 'failed',
               error_message = $1
           WHERE id = $2
             AND organization_id = $3`,
          [message.slice(0, 4000), meetingId, organizationId],
        );
      } catch (statusError) {
        this.logger.error(
          `Could not persist failure status for meeting ${meetingId}`,
          statusError instanceof Error
            ? statusError.stack
            : undefined,
        );
      }

      throw error;
    }
  }

  @Process('analyze-text')
  async analyzeImportedText(
    job: Job<{ meetingId: string; organizationId: string; actorId: string }>,
  ) {
    const { meetingId, organizationId, actorId } = job.data;
    if (!meetingId || !organizationId || !actorId) {
      throw new Error('Text meeting analysis requires meetingId, organizationId and actorId.');
    }

    try {
      const meetingResult = await this.db.query<{ title: string | null; created_by_id: string; team_id: string | null }>(
        `SELECT title, created_by_id, team_id FROM meetings
         WHERE id = $1 AND organization_id = $2 AND source_type IN ('transcript', 'notes')`,
        [meetingId, organizationId],
      );
      const meeting = meetingResult.rows[0];
      if (!meeting) throw new Error('Imported meeting not found in the specified organisation.');

      const processing = await this.db.query(
        `UPDATE meetings SET status = 'processing', processing_stage = 'indexing',
           error_message = NULL, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2 RETURNING id`,
        [meetingId, organizationId],
      );
      if (!processing.rows[0]) throw new Error('Imported meeting is no longer available.');

      const analysis = await this.meetingIntelligence.processTranscript({
        meetingId,
        organizationId,
        userId: actorId || meeting.created_by_id,
      });

      await this.commitMeetingCompletion({
        meetingId,
        organizationId,
        meetingTitle: meeting.title ?? 'Untitled Meeting',
        teamId: meeting.team_id,
        actorId,
        userId: actorId,
        jobId: String(job.id ?? ''),
        jobTimestamp: Number(job.timestamp),
      });

      await job.progress(100).catch((progressError: unknown) => { this.logger.warn(`Meeting ${meetingId} completed, but progress reporting failed: ${progressError instanceof Error ? progressError.message : String(progressError)}`); });
      return analysis;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await this.db.query(
          `UPDATE meetings SET status = 'failed', processing_stage = 'failed',
             error_message = $1, updated_at = NOW()
           WHERE id = $2 AND organization_id = $3`,
          [message.slice(0, 4000), meetingId, organizationId],
        );
      } catch (statusError) {
        this.logger.error(`Could not persist imported meeting failure ${meetingId}`, statusError instanceof Error ? statusError.stack : undefined);
      }
      throw error;
    }
  }
}