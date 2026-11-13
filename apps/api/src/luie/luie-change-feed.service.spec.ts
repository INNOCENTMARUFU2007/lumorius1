import { BadRequestException } from '@nestjs/common';
import { LuieChangeFeedService } from './luie-change-feed.service';

describe('LuieChangeFeedService', () => {
  const db = { query: jest.fn() };
  let service: LuieChangeFeedService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LuieChangeFeedService(db as never);
  });

  it('returns only visible event categories and advances the composite cursor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      id: '11111111-1111-4111-8111-111111111111',
      created_at: new Date('2026-11-13T10:00:00.000Z'),
      event_type: 'task.updated',
    }] });

    const result = await service.getChanges(
      'org-1',
      'user-1',
      'member',
      '2026-11-13T09:00:00.000Z',
      '00000000-0000-0000-0000-000000000000',
    );

    expect(db.query.mock.calls[0][0]).toContain('event.organization_id = $1::uuid');
    expect(db.query.mock.calls[0][0]).toContain('event.team_id IS NULL');
    expect(db.query.mock.calls[0][1]).toEqual([
      'org-1',
      '2026-11-13T09:00:00.000Z',
      '00000000-0000-0000-0000-000000000000',
      false,
      'user-1',
    ]);
    expect(result).toEqual({
      changed: true,
      categories: ['tasks', 'projects', 'workflows', 'analytics'],
      hasMore: false,
      cursor: {
        since: '2026-11-13T10:00:00.000Z',
        afterId: '11111111-1111-4111-8111-111111111111',
      },
    });
  });

  it('rejects invalid cursors without querying the database', async () => {
    await expect(service.getChanges('org-1', 'user-1', 'member', 'invalid'))
      .rejects.toThrow(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });
});
