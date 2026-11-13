import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { AiService } from '../ai/ai.service';
import { LuieEventPublisher } from '../luie/luie-event.publisher';
import { MeetingIntelligenceService } from './meeting-intelligence.service';
import { MeetingsProcessor } from './meetings.processor';

describe('MeetingsProcessor LUIE completion transaction', () => {
  const client = { query: jest.fn() };
  const db = { transaction: jest.fn() };
  const publisher = { append: jest.fn().mockResolvedValue({ eventId: 'event-1', duplicate: false, deliveriesInserted: 1 }) };
  let processor: MeetingsProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    client.query.mockResolvedValue({ rows: [{ id: '11111111-1111-4111-8111-111111111111' }], rowCount: 1 });
    db.transaction.mockImplementation(async (callback: (client: typeof client) => Promise<unknown>) => callback(client));
    processor = new MeetingsProcessor(
      db as unknown as DatabaseService,
      {} as StorageService,
      {} as AiService,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      publisher as unknown as LuieEventPublisher,
      {} as MeetingIntelligenceService,
    );
  });

  it('commits meeting completion and meeting.completed outbox event on the same client', async () => {
    const occurredAt = 1760000000000;
    await (processor as unknown as { commitMeetingCompletion(input: Record<string, unknown>): Promise<void> }).commitMeetingCompletion({
      meetingId: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
      meetingTitle: 'Quarterly review', actorId: '33333333-3333-4333-8333-333333333333',
      userId: '33333333-3333-4333-8333-333333333333',
      jobId: 'meeting-recording-1', jobTimestamp: occurredAt,
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0][0]).toContain("SET status = 'completed'");
    expect(publisher.append).toHaveBeenCalledWith(client, expect.objectContaining({
      eventType: 'meeting.completed',
      eventKey: `meeting.completed:11111111-1111-4111-8111-111111111111:meeting-recording-1:${occurredAt}`,
      occurredAt: new Date(occurredAt),
      payload: expect.not.objectContaining({ summary: expect.anything() }),
    }), ['luie.legacy-domain-bridge']);
  });

  it('rejects a missing stable Bull identity before opening a transaction', async () => {
    await expect((processor as unknown as { commitMeetingCompletion(input: Record<string, unknown>): Promise<void> }).commitMeetingCompletion({
      meetingId: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
      meetingTitle: 'Quarterly review', actorId: null, userId: null,
      jobId: '', jobTimestamp: 0,
    })).rejects.toThrow('stable Bull job identity');
    expect(db.transaction).not.toHaveBeenCalled();
  });
});