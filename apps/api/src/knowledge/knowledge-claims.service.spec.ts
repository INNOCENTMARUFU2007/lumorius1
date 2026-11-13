import { normalizeKnowledgeClaims } from './knowledge-claims.service';

const chunkA = {
  chunk_id: '11111111-1111-4111-8111-111111111111',
  chunk_index: 0,
  content: 'Lumorius has a monthly subscription price of USD 49 for the Growth plan.',
};

const chunkB = {
  chunk_id: '22222222-2222-4222-8222-222222222222',
  chunk_index: 1,
  content: 'The Growth plan monthly subscription price remains USD 49 and includes advanced company knowledge search and analytics.',
};

describe('normalizeKnowledgeClaims', () => {
  it('accepts claims only when the quotation exists in a source chunk', () => {
    const result = normalizeKnowledgeClaims([
      {
        subject: 'Lumorius',
        predicate: 'has monthly price',
        object: 'USD 49',
        valueType: 'currency',
        confidence: 0.92,
        evidenceQuote: 'monthly subscription price of USD 49',
        sourceChunkIds: [chunkA.chunk_id],
      },
    ], [chunkA, chunkB]);

    expect(result).toHaveLength(1);
    expect(result[0].subjectKey).toBe('lumorius');
    expect(result[0].predicateKey).toBe('HAS_MONTHLY_PRICE');
    expect(result[0].objectKey).toBe('usd 49');
    expect(result[0].valueType).toBe('currency');
    expect(result[0].evidence[0].sourceChunkIds).toEqual([chunkA.chunk_id]);
  });

  it('rejects fabricated quotations that do not occur in the document', () => {
    const result = normalizeKnowledgeClaims([
      {
        subject: 'Lumorius',
        predicate: 'HAS_MONTHLY_PRICE',
        object: 'USD 1',
        confidence: 0.99,
        evidenceQuote: 'Lumorius costs USD 1,000,000 per month',
        sourceChunkIds: [chunkA.chunk_id],
      },
    ], [chunkA]);

    expect(result).toHaveLength(0);
  });

  it('recovers a valid source chunk when the model supplied the wrong chunk ID', () => {
    const result = normalizeKnowledgeClaims([
      {
        subject: 'Lumorius',
        predicate: 'HAS_MONTHLY_PRICE',
        object: 'USD 49',
        confidence: 0.8,
        evidenceQuote: 'monthly subscription price of USD 49',
        sourceChunkIds: [chunkB.chunk_id],
      },
    ], [chunkA, chunkB]);

    expect(result).toHaveLength(1);
    expect(result[0].evidence[0].sourceChunkIds).toEqual([chunkA.chunk_id]);
  });

  it('merges duplicate assertions while preserving distinct matching source quotations', () => {
    const result = normalizeKnowledgeClaims([
      {
        subject: 'Lumorius',
        predicate: 'HAS_MONTHLY_PRICE',
        object: 'USD 49',
        confidence: 0.8,
        evidenceQuote: 'monthly subscription price of USD 49',
        sourceChunkIds: [chunkA.chunk_id],
      },
      {
        subject: 'lumorius',
        predicate: 'has monthly price',
        object: 'usd 49',
        confidence: 0.9,
        evidenceQuote: 'Growth plan monthly subscription price remains USD 49',
        sourceChunkIds: [chunkB.chunk_id],
      },
    ], [chunkA, chunkB]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.9);
    expect(result[0].evidence).toHaveLength(2);
  });

  it('rejects low-confidence and incomplete claims', () => {
    const result = normalizeKnowledgeClaims([
      {
        subject: 'Lumorius',
        predicate: 'HAS_MONTHLY_PRICE',
        object: 'USD 49',
        confidence: 0.2,
        evidenceQuote: 'monthly subscription price of USD 49',
        sourceChunkIds: [chunkA.chunk_id],
      },
      {
        subject: '',
        predicate: 'HAS_MONTHLY_PRICE',
        object: 'USD 49',
        evidenceQuote: 'monthly subscription price of USD 49',
      },
    ], [chunkA]);

    expect(result).toHaveLength(0);
  });
});