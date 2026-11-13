import { DatabaseService } from '../database/database.service';
import { AiService } from '../ai/ai.service';
import {
  MeetingCrossMeetingIntelligenceService,
  MeetingIntelligenceActor,
} from './meeting-cross-meeting-intelligence.service';

describe('MeetingCrossMeetingIntelligenceService', () => {
  const actor: MeetingIntelligenceActor = {
    organizationId: 'org-1',
    userId: 'user-1',
    role: 'member',
  };

  const embedding = Array.from({ length: 1536 }, (_, index) => index === 0 ? 0.5 : 0.01);

  let query: jest.Mock;
  let createEmbedding: jest.Mock;
  let chat: jest.Mock;
  let service: MeetingCrossMeetingIntelligenceService;

  const sourceRow = {
    chunk_id: 'chunk-1',
    meeting_id: 'meeting-1',
    transcript_id: 'transcript-1',
    meeting_title: 'Quarterly planning',
    meeting_created_at: new Date('2026-11-05T10:00:00.000Z'),
    chunk_index: 2,
    start_ms: '12000',
    end_ms: '18000',
    speaker_label: 'Speaker 1',
    excerpt: 'The team agreed to review the launch plan next week.',
    lexical_score: 0.8,
    semantic_score: 0.9,
    relevance_score: 0.86,
  };

  beforeEach(() => {
    query = jest.fn().mockResolvedValue({ rows: [sourceRow] });
    createEmbedding = jest.fn().mockResolvedValue(embedding);
    chat = jest.fn().mockResolvedValue('The team agreed to review the launch plan [S1].');

    service = new MeetingCrossMeetingIntelligenceService(
      { query } as unknown as DatabaseService,
      { createEmbedding, chat } as unknown as AiService,
    );
  });

  it('rejects unauthenticated actor context before retrieval', async () => {
    await expect(service.search({ query: 'launch plan' }, {
      organizationId: '', userId: 'user-1', role: 'member',
    })).rejects.toThrow('Authenticated organization and user context are required.');
    expect(createEmbedding).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('validates query length before calling providers', async () => {
    await expect(service.search({ query: 'x' }, actor)).rejects.toThrow(
      'Search query must contain at least two characters.',
    );
    expect(createEmbedding).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('uses existing transcript embeddings and returns timestamped hybrid sources', async () => {
    const result = await service.search({ query: 'launch plan', limit: 5 }, actor);

    expect(result.retrievalMode).toBe('hybrid');
    expect(result.resultCount).toBe(1);
    expect(result.sources[0]).toMatchObject({
      citationId: 'S1',
      meetingId: 'meeting-1',
      transcriptId: 'transcript-1',
      chunkId: 'chunk-1',
      chunkIndex: 2,
      startMs: 12000,
      endMs: 18000,
      excerpt: sourceRow.excerpt,
    });
    expect(createEmbedding).toHaveBeenCalledWith('launch plan', {
      organizationId: 'org-1',
      userId: 'user-1',
      feature: 'meeting_cross_meeting_retrieval',
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('meeting_transcript_chunks'), expect.arrayContaining([
      'org-1', false, 'user-1', 'launch plan', expect.any(String), 120, 5,
    ]));
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('meeting.team_id IS NULL');
    expect(sql).toContain('FROM team_members member');
    expect(sql).toContain('transcript_retention_expires_at');
  });

  it('falls back to full-text retrieval when embedding generation fails', async () => {
    createEmbedding.mockRejectedValueOnce(new Error('provider unavailable'));

    const result = await service.search({ query: 'launch plan' }, actor);

    expect(result.retrievalMode).toBe('full_text');
    expect(query.mock.calls[0][1][4]).toBeNull();
  });

  it('grounds answers in retrieved evidence and removes unknown citation labels', async () => {
    chat.mockResolvedValueOnce('The team agreed to review the launch plan [S1]. Unsupported claim [S99].');

    const result = await service.ask({ query: 'What did the team agree to do?' }, actor);

    expect(chat).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      organizationId: 'org-1',
      userId: 'user-1',
      feature: 'meeting_cross_meeting_qa',
    }));
    expect(result.answer).toContain('[S1]');
    expect(result.answer).toContain('[unverified citation removed]');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].chunkId).toBe('chunk-1');
  });

  it('does not call the language model when retrieval returns no evidence', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const result = await service.ask({ query: 'What was agreed?' }, actor);

    expect(result.evidenceCount).toBe(0);
    expect(result.citations).toEqual([]);
    expect(chat).not.toHaveBeenCalled();
  });

  it('scopes recurring themes to accessible meetings in the organisation', async () => {
    query.mockResolvedValueOnce({ rows: [{ topic: 'Hiring', meeting_count: 2, meetings: [] }] });

    const result = await service.themes(actor, 30);

    expect(result.periodDays).toBe(30);
    expect(result.themes).toHaveLength(1);
    expect(query.mock.calls[0][1]).toEqual(['org-1', false, 'user-1', 30]);
    expect(String(query.mock.calls[0][0])).toContain('team_members');
  });

  it('does not expose a linked task from a team the actor cannot access', async () => {
    await service.commitments(actor, 20);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('task.team_id IS NULL');
    expect(sql).toContain('task_member.team_id = task.team_id');
    expect(sql).toContain('CASE WHEN task.id IS NOT NULL THEN action.created_task_id ELSE NULL END');
    expect(query.mock.calls[0][1]).toEqual(['org-1', false, 'user-1', 20]);
  });

  it('does not expose a governed decision from a team the actor cannot access', async () => {
    await service.decisionContinuity(actor, 20);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('decision.team_id IS NULL');
    expect(sql).toContain('decision_member.team_id = decision.team_id');
    expect(sql).toContain('CASE WHEN decision.id IS NOT NULL THEN candidate.knowledge_decision_id ELSE NULL END');
    expect(query.mock.calls[0][1]).toEqual(['org-1', false, 'user-1', 20]);
  });

  it('scopes timeline entries to meetings visible to the authenticated actor', async () => {
    await service.timeline(actor, 25);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('WITH visible_meetings AS');
    expect(sql).toContain('meeting.organization_id = $1');
    expect(sql).toContain('visible_meetings meeting');
    expect(query.mock.calls[0][1]).toEqual(['org-1', false, 'user-1', 25]);
  });
});