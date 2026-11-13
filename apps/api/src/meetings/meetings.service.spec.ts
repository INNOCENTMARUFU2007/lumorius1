import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { LuieEventPublisher } from '../luie/luie-event.publisher';
import { MeetingsService } from './meetings.service';

describe('MeetingsService durable recording cleanup', () => {
  const meetingId = '11111111-1111-4111-8111-111111111111';
  const organizationId = '22222222-2222-4222-8222-222222222222';
  const userId = '33333333-3333-4333-8333-333333333333';
  const teamId = '44444444-4444-4444-8444-444444444444';
  let service: MeetingsService;
  let client: { query: jest.Mock };
  let db: { transaction: jest.Mock };
  let storage: { delete: jest.Mock };
  let publisher: { append: jest.Mock };

  beforeEach(() => {
    client = { query: jest.fn() };
    db = {
      transaction: jest.fn(async (callback: (connection: typeof client) => Promise<unknown>) =>
        callback(client)),
    };
    storage = { delete: jest.fn().mockResolvedValue(undefined) };
    publisher = {
      append: jest.fn().mockResolvedValue({
        eventId: 'event-1',
        duplicate: false,
        deliveriesInserted: 1,
      }),
    };
    service = new MeetingsService(
      db as unknown as DatabaseService,
      storage as unknown as StorageService,
      {} as never,
      publisher as unknown as LuieEventPublisher,
    );
  });

  it('queues recording cleanup and emits meeting.deleted atomically with deletion', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: meetingId,
          title: 'Quarterly review',
          status: 'completed',
          audio_key: 'orgs/org/meetings/meeting/recording.mp3',
          team_id: teamId,
        }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: meetingId }], rowCount: 1 });

    await expect(service.delete(meetingId, {
      organizationId,
      userId,
      role: 'owner',
    })).resolves.toEqual({ deleted: true, recordingCleanup: 'queued' });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE OF meeting');
    expect(client.query.mock.calls[1][0]).toContain('INSERT INTO document_storage_cleanup_outbox');
    expect(client.query.mock.calls[1][1]).toEqual([
      organizationId,
      meetingId,
      'orgs/org/meetings/meeting/recording.mp3',
    ]);
    expect(client.query.mock.calls[2][0]).toContain('DELETE FROM meetings');
    expect(publisher.append).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        eventType: 'meeting.deleted',
        aggregateId: meetingId,
        teamId,
        payload: expect.objectContaining({ recordingCleanupQueued: true }),
      }),
      ['luie.legacy-domain-bridge'],
    );
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
