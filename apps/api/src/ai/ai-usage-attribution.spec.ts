import { AiService } from './ai.service';
import { DatabaseService } from '../database/database.service';
import { ConfigService } from '@nestjs/config';

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
    embeddings: { create: jest.fn() },
  })),
}));

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({})),
}));

describe('AI usage attribution', () => {
  const organizationId = '22222222-2222-4222-8222-222222222222';
  const userId = '33333333-3333-4333-8333-333333333333';
  const meetingId = '44444444-4444-4444-8444-444444444444';
  let db: { query: jest.Mock };
  let service: AiService;

  beforeEach(() => {
    db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    const config = {
      get: jest.fn((key: string) =>
        key === 'ai.openai.apiKey' ? 'test-openai-key' : undefined,
      ),
    };
    service = new AiService(
      config as unknown as ConfigService,
      db as unknown as DatabaseService,
    );
  });

  it('records Whisper duration, provider, user, feature and an idempotency key without inventing tokens', async () => {
    await service.recordAudioTranscriptionUsage({
      meetingId,
      organizationId,
      userId,
      audioDurationSeconds: 91.2,
    });

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, values] = db.query.mock.calls[0];
    expect(String(sql)).toContain('INSERT INTO ai_usage');
    expect(String(sql)).toContain('audio_duration_seconds');
    expect(String(sql)).toContain('ON CONFLICT DO NOTHING');
    expect(values).toEqual([
      organizationId,
      userId,
      'openai',
      'whisper-1',
      0,
      0,
      0,
      'meeting_transcription',
      'transcription',
      92,
      `meeting.transcription:${meetingId}`,
      false,
    ]);
  });

  it('records a completed transcription even when provider duration is unavailable', async () => {
    await service.recordAudioTranscriptionUsage({
      meetingId,
      organizationId,
    });

    const values = db.query.mock.calls[0][1];
    expect(values[9]).toBeNull();
    expect(values[11]).toBe(false);
  });

  it('rejects transcription usage without organisation or meeting identity', async () => {
    await expect(
      service.recordAudioTranscriptionUsage({
        meetingId: '',
        organizationId,
      }),
    ).rejects.toThrow('Meeting transcription usage requires meetingId and organizationId.');
    expect(db.query).not.toHaveBeenCalled();
  });
});