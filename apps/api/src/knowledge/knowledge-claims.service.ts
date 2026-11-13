import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface KnowledgeClaimChunk {
  chunk_id: string;
  chunk_index: number;
  content: string;
}

export interface NormalizedClaimEvidence {
  quote: string;
  sourceChunkIds: string[];
  confidence: number;
}

export interface NormalizedKnowledgeClaim {
  subject: string;
  subjectKey: string;
  predicate: string;
  predicateKey: string;
  object: string;
  objectKey: string;
  valueType: 'text' | 'number' | 'currency' | 'date' | 'boolean' | 'percentage' | 'status';
  isNegated: boolean;
  confidence: number;
  evidence: NormalizedClaimEvidence[];
}

const VALUE_TYPES = new Set([
  'text',
  'number',
  'currency',
  'date',
  'boolean',
  'percentage',
  'status',
]);

function normalizeIdentity(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeQuote(value: string): string {
  return normalizeIdentity(value);
}

function clampConfidence(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(1, parsed))
    : 0.7;
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().slice(0, maxLength)
    : '';
}

/**
 * Normalize model output and retain only claims whose quoted evidence can be
 * found verbatim (whitespace/case normalized) in a real source chunk.
 */
export function normalizeKnowledgeClaims(
  input: unknown,
  chunks: readonly KnowledgeClaimChunk[],
): NormalizedKnowledgeClaim[] {
  if (!Array.isArray(input) || !chunks.length) return [];

  const chunkById = new Map<string, KnowledgeClaimChunk>(
    chunks.map(chunk => [chunk.chunk_id, chunk] as const),
  );
  const normalizedChunks = chunks.map(chunk => ({
    id: chunk.chunk_id,
    content: normalizeQuote(String(chunk.content ?? '')),
  }));

  const claims = new Map<string, NormalizedKnowledgeClaim>();

  for (const raw of input.slice(0, 250)) {
    if (!raw || typeof raw !== 'object') continue;

    const item = raw as Record<string, unknown>;
    const subject = cleanText(item.subject, 180);
    const predicateRaw = cleanText(item.predicate, 100);
    const object = cleanText(item.object ?? item.value, 500);
    const quote = cleanText(item.evidenceQuote, 800);
    const confidence = clampConfidence(item.confidence);

    const predicate = predicateRaw
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);

    if (!subject || !predicate || !object || confidence < 0.55) continue;

    const quoteKey = normalizeQuote(quote);
    if (quoteKey.length < 8) continue;

    const declaredIds = Array.isArray(item.sourceChunkIds)
      ? Array.from(new Set(
          item.sourceChunkIds.filter(
            (id): id is string => typeof id === 'string' && chunkById.has(id),
          ),
        ))
      : [];

    const candidates = declaredIds.length
      ? normalizedChunks.filter(chunk => declaredIds.includes(chunk.id))
      : normalizedChunks;

    let matchingIds = candidates
      .filter(chunk => chunk.content.includes(quoteKey))
      .map(chunk => chunk.id);

    // Recover from an incorrect model-supplied chunk ID only when the exact
    // quotation independently matches another chunk in this same document.
    if (!matchingIds.length && declaredIds.length) {
      matchingIds = normalizedChunks
        .filter(chunk => chunk.content.includes(quoteKey))
        .map(chunk => chunk.id);
    }

    if (!matchingIds.length) continue;

    const subjectKey = normalizeIdentity(subject);
    const predicateKey = predicate;
    const objectKey = normalizeIdentity(object);
    const valueTypeRaw = cleanText(item.valueType, 24).toLowerCase();
    const valueType = (VALUE_TYPES.has(valueTypeRaw) ? valueTypeRaw : 'text') as NormalizedKnowledgeClaim['valueType'];
    const isNegated = item.isNegated === true;
    const identity = JSON.stringify([
      subjectKey,
      predicateKey,
      objectKey,
      valueType,
      isNegated,
    ]);

    let claim = claims.get(identity);
    if (!claim) {
      claim = {
        subject,
        subjectKey,
        predicate,
        predicateKey,
        object,
        objectKey,
        valueType,
        isNegated,
        confidence,
        evidence: [],
      };
      claims.set(identity, claim);
    } else {
      claim.confidence = Math.max(claim.confidence, confidence);
    }

    const existingEvidence = claim.evidence.find(
      evidence => normalizeQuote(evidence.quote) === quoteKey,
    );

    if (existingEvidence) {
      existingEvidence.sourceChunkIds = Array.from(new Set([
        ...existingEvidence.sourceChunkIds,
        ...matchingIds,
      ])).slice(0, 40);
      existingEvidence.confidence = Math.max(existingEvidence.confidence, confidence);
    } else {
      claim.evidence.push({
        quote,
        sourceChunkIds: matchingIds.slice(0, 40),
        confidence,
      });
    }
  }

  return Array.from(claims.values()).slice(0, 250);
}

@Injectable()
export class KnowledgeClaimsService {
  constructor(private readonly db: DatabaseService) {}

  normalizeClaims(
    input: unknown,
    chunks: readonly KnowledgeClaimChunk[],
  ): NormalizedKnowledgeClaim[] {
    return normalizeKnowledgeClaims(input, chunks);
  }

  async persistClaims(
    organizationId: string,
    documentId: string,
    claims: readonly NormalizedKnowledgeClaim[],
    extractionVersion: number,
  ): Promise<number> {
    if (!organizationId || !documentId || !claims.length) return 0;

    return this.db.transaction(async client => {
      for (const claim of claims) {
        const subjectNode = await client.query<{ id: string }>(
          `SELECT id
             FROM knowledge_nodes
            WHERE organization_id = $1::uuid
              AND canonical_key = $2
              AND type <> 'document'
            ORDER BY created_at ASC
            LIMIT 1`,
          [organizationId, claim.subjectKey],
        );

        const claimResult = await client.query<{ id: string }>(
          `INSERT INTO knowledge_claims (
             organization_id,
             subject_node_id,
             subject_text,
             subject_key,
             predicate,
             predicate_key,
             object_text,
             object_key,
             value_type,
             is_negated,
             confidence
           )
           VALUES (
             $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11
           )
           ON CONFLICT (
             organization_id,
             subject_key,
             predicate_key,
             object_key,
             value_type,
             is_negated
           )
           DO UPDATE SET
             subject_node_id = COALESCE(
               knowledge_claims.subject_node_id,
               EXCLUDED.subject_node_id
             ),
             confidence = GREATEST(
               knowledge_claims.confidence,
               EXCLUDED.confidence
             ),
             last_seen_at = NOW(),
             updated_at = NOW()
           RETURNING id`,
          [
            organizationId,
            subjectNode.rows[0]?.id ?? null,
            claim.subject,
            claim.subjectKey,
            claim.predicate,
            claim.predicateKey,
            claim.object,
            claim.objectKey,
            claim.valueType,
            claim.isNegated,
            claim.confidence,
          ],
        );

        const claimId = claimResult.rows[0]?.id;
        if (!claimId) {
          throw new Error(`Could not persist claim: ${claim.subject} ${claim.predicate}.`);
        }

        for (const evidence of claim.evidence) {
          if (!evidence.sourceChunkIds.length) continue;

          await client.query(
            `INSERT INTO knowledge_claim_evidence (
               organization_id,
               claim_id,
               document_id,
               source_chunk_ids,
               evidence_quote,
               stance,
               evidence_hash,
               confidence,
               extraction_version,
               metadata
             )
             VALUES (
               $1::uuid,
               $2::uuid,
               $3::uuid,
               $4::uuid[],
               $5,
               'supports',
               md5($6),
               $7,
               $8,
               $9::jsonb
             )
             ON CONFLICT (
               organization_id,
               claim_id,
               document_id,
               stance,
               evidence_hash
             )
             DO UPDATE SET
               source_chunk_ids = ARRAY(
                 SELECT DISTINCT chunk_id
                 FROM unnest(
                   knowledge_claim_evidence.source_chunk_ids || EXCLUDED.source_chunk_ids
                 ) AS evidence_chunks(chunk_id)
               ),
               evidence_quote = CASE
                 WHEN length(EXCLUDED.evidence_quote) >
                      length(knowledge_claim_evidence.evidence_quote)
                 THEN EXCLUDED.evidence_quote
                 ELSE knowledge_claim_evidence.evidence_quote
               END,
               confidence = GREATEST(
                 knowledge_claim_evidence.confidence,
                 EXCLUDED.confidence
               ),
               extraction_version = GREATEST(
                 knowledge_claim_evidence.extraction_version,
                 EXCLUDED.extraction_version
               ),
               last_seen_at = NOW(),
               metadata = knowledge_claim_evidence.metadata || EXCLUDED.metadata,
               updated_at = NOW()`,
            [
              organizationId,
              claimId,
              documentId,
              evidence.sourceChunkIds,
              evidence.quote,
              normalizeQuote(evidence.quote),
              evidence.confidence,
              extractionVersion,
              JSON.stringify({
                evidenceOrigin: 'verbatim_document_quote',
                extractionVersion,
              }),
            ],
          );
        }
      }

      return claims.length;
    });
  }
}