import { MeetingIntelligenceService } from './meeting-intelligence.service';

describe('MeetingIntelligenceService', () => {
  it('indexes the complete transcript and persists only evidence-verified proposals', async () => {
    const transcript = 'I will prepare and send the report. We decided to launch on Monday.';
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] });
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{
          id: '33333333-3333-4333-8333-333333333333',
          content: transcript,
          segments: [],
          language: 'en',
          created_by_id: '11111111-1111-4111-8111-111111111111',
        }] })
        .mockResolvedValue({ rows: [] }),
      transaction: jest.fn(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) =>
        callback({ query: clientQuery })),
    };
    const ai = {
      createEmbeddings: jest.fn().mockResolvedValue([Array(1536).fill(0)]),
      chat: jest.fn()
        .mockResolvedValueOnce(JSON.stringify({
          chunkSummaries: [{ sourceChunkIndex: 0, summary: 'A report will be prepared and a launch decision was made.' }],
          actionItems: [{
            sourceChunkIndex: 0,
            actionText: 'Prepare and send the report',
            assigneeName: null,
            dueAt: null,
            priority: 'high',
            confidence: 0.92,
            evidenceExcerpt: 'I will prepare and send the report.',
          }],
          decisions: [{
            sourceChunkIndex: 0,
            description: 'Launch on Monday',
            decisionMaker: null,
            confidence: 0.91,
            evidenceExcerpt: 'We decided to launch on Monday.',
          }],
          openQuestions: [],
          risks: [],
          keyTopics: ['Launch planning'],
          strategicInsights: [],
          sentiment: 'neutral',
        }))
        .mockResolvedValueOnce(JSON.stringify({
          summary: 'The meeting agreed that a report will be prepared and the launch will occur on Monday.',
          keyTopics: ['Launch planning'],
          strategicInsights: [],
          sentiment: 'neutral',
        })),
    };

    const service = new MeetingIntelligenceService(db as never, ai as never);
    const result = await service.processTranscript({
      meetingId: '22222222-2222-4222-8222-222222222222',
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.summary).toContain('report');
    expect(result.actionItems).toHaveLength(1);
    expect(result.decisions).toHaveLength(1);
    expect(ai.createEmbeddings).toHaveBeenCalledWith(
      [transcript],
      expect.objectContaining({ feature: 'meeting_transcript_indexing' }),
    );
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO meeting_action_items'),
      expect.any(Array),
    );
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO meeting_decision_candidates'),
      expect.any(Array),
    );
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO meeting_analyses'),
      expect.any(Array),
    );
  });
});