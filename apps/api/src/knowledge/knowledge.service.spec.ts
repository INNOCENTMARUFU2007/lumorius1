import { BadRequestException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { DatabaseService } from '../database/database.service';
import { KnowledgeService } from './knowledge.service';

describe('KnowledgeService node creation', () => {
  let service: KnowledgeService;
  let db: { query: jest.Mock; transaction: jest.Mock };
  let aiService: { createEmbedding: jest.Mock };

  beforeEach(() => {
    db = {
      query: jest.fn(),
      transaction: jest.fn(),
    };
    aiService = {
      createEmbedding: jest.fn().mockResolvedValue([0.1, 0.2]),
    };
    service = new KnowledgeService(
      db as unknown as DatabaseService,
      aiService as unknown as AiService,
    );
  });

  it('normalizes labels and node types and stores a canonical identity', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'node-1' }] });
    db.transaction.mockImplementation(
      async (callback: (value: unknown) => Promise<unknown>) =>
        callback(client),
    );
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'node-1', label: 'Acme Incorporated' }],
      });

    await service.createNode('org-1', {
      name: '  Acme   Incorporated  ',
      type: ' ORGANIZATION ',
    });

    const insertValues = client.query.mock.calls[2][1] as unknown[];
    expect(insertValues[2]).toBe('Acme Incorporated');
    expect(insertValues[3]).toBe('organization');
    expect(insertValues[9]).toBe('acme incorporated');
  });

  it('reuses an existing non-document node with the same canonical identity', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'existing-node' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'existing-node', label: 'Acme Incorporated' }],
      });

    const result = await service.createNode('org-1', {
      name: 'acme incorporated',
      type: 'organization',
    });

    expect(result.id).toBe('existing-node');
    expect(db.query.mock.calls[0][1]).toEqual([
      'org-1',
      'organization',
      'acme incorporated',
    ]);
    expect(aiService.createEmbedding).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects empty names and malformed node types before embedding', async () => {
    await expect(
      service.createNode('org-1', { name: '  ', type: 'organization' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createNode('org-1', { name: 'Acme', type: 'old type' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(aiService.createEmbedding).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
