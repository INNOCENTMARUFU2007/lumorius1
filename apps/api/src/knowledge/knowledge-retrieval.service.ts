import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AiService } from '../ai/ai.service';

interface RetrievalRequest {
  organizationId: string;
  userId: string;
  role: string;
  query: string;
  limit?: number;
  documentIds?: string[];
  teamId?: string;
}

interface RetrievalRow extends Record<string, unknown> {
  evidence_id: string;
  evidence_type: string;
  evidence_status: string;
  confidence: number | string;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  document_id: string;
  document_name: string;
  document_type: string;
  chunk_id: string;
  chunk_index: number;
  excerpt: string;
  entity_id: string | null;
  entity_label: string | null;
  entity_type: string | null;
  edge_id: string | null;
  relationship: string | null;
  source_node_id: string | null;
  target_node_id: string | null;
  source_label: string | null;
  target_label: string | null;
  source_verified: boolean;
  semantic_score: number | string;
  lexical_score: number | string;
  relevance_score: number | string;
}

interface StructuredRetrievalRow extends Record<string, unknown> {
  source_type: string;
  source_id: string;
  title: string;
  excerpt: string;
  updated_at: Date | string;
  team_id: string | null;
  relevance_score: number | string;
}

@Injectable()
export class KnowledgeRetrievalService {
  private readonly logger = new Logger(KnowledgeRetrievalService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly ai: AiService,
  ) {}

  async retrieve(input: RetrievalRequest) {
    const query = String(input.query ?? '').trim();

    if (query.length < 2) {
      throw new Error('Search query must contain at least two characters.');
    }

    if (query.length > 2000) {
      throw new Error('Search query exceeds 2000 characters.');
    }

    if (!input.userId || !input.organizationId) {
      throw new Error('Authenticated organization and user context are required.');
    }

    const requestedLimit = Number(input.limit ?? 8);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(20, Math.max(1, Math.floor(requestedLimit)))
      : 8;

    const privileged = [
      'owner',
      'admin',
      'super_admin',
    ].includes(String(input.role ?? '').toLowerCase());

    // Semantic retrieval is optional. Lexical retrieval remains available
    // when the embedding provider is temporarily unavailable.
    let embedding: number[] | null = null;

    try {
      const generated = await this.ai.createEmbedding(query, {
        organizationId: input.organizationId,
        userId: input.userId,
        feature: 'knowledge_retrieval',
      });

      if (
        Array.isArray(generated) &&
        generated.length === 1536 &&
        generated.every(Number.isFinite)
      ) {
        embedding = generated;
      } else {
        this.logger.warn(
          'Retrieval embedding unavailable or dimension mismatch. Using lexical search.',
        );
      }
    } catch (error) {
      this.logger.warn(
        `Semantic retrieval unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const vector = embedding
      ? `[${embedding.join(',')}]`
      : null;

    const documentIds = input.documentIds?.length
      ? input.documentIds
      : null;

    const result = await this.db.query<RetrievalRow>(
      `WITH search_terms AS (
         SELECT plainto_tsquery('english', $3) AS query
       ),

       candidates AS (
         SELECT
           evidence.id AS evidence_id,
           evidence.evidence_type,
           evidence.status AS evidence_status,
           evidence.confidence,
           evidence.first_seen_at,
           evidence.last_seen_at,

           document.id AS document_id,
           document.name AS document_name,
           document.type AS document_type,

           chunk.id AS chunk_id,
           chunk.chunk_index,
           LEFT(chunk.content, 4000) AS excerpt,

           entity.id AS entity_id,
           entity.label AS entity_label,
           entity.type AS entity_type,

           edge.id AS edge_id,
           edge.relationship,

           source_node.id AS source_node_id,
           target_node.id AS target_node_id,

           source_node.label AS source_label,
           target_node.label AS target_label,

           CASE
             WHEN evidence.node_id IS NOT NULL
               THEN entity.id IS NOT NULL

             WHEN evidence.edge_id IS NOT NULL
               THEN edge.id IS NOT NULL
                AND source_node.id IS NOT NULL
                AND target_node.id IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM knowledge_evidence verify_source
                  WHERE verify_source.organization_id = evidence.organization_id
                    AND verify_source.node_id = edge.source_id
                    AND verify_source.document_id = document.id
                    AND verify_source.status IN ('active', 'disputed')
                )
                AND EXISTS (
                  SELECT 1
                  FROM knowledge_evidence verify_target
                  WHERE verify_target.organization_id = evidence.organization_id
                    AND verify_target.node_id = edge.target_id
                    AND verify_target.document_id = document.id
                    AND verify_target.status IN ('active', 'disputed')
                )

             ELSE FALSE
           END AS source_verified,

           CASE
             WHEN chunk.embedding IS NULL OR $2::vector IS NULL
             THEN 0::double precision
             ELSE GREATEST(
               0::double precision,
               LEAST(
                 1::double precision,
                 1 - (chunk.embedding <=> $2::vector)
               )
             )
           END AS semantic_score,

           ts_rank_cd(
             to_tsvector('english', COALESCE(chunk.content, '')),
             search_terms.query
           )::double precision AS lexical_score

         FROM knowledge_evidence evidence

         JOIN documents document
           ON document.id = evidence.document_id
          AND document.organization_id = evidence.organization_id
          AND document.status::text = 'indexed'

         CROSS JOIN search_terms

         JOIN LATERAL unnest(
           evidence.source_chunk_ids
         ) AS source_chunk(chunk_id) ON TRUE

         JOIN document_chunks chunk
           ON chunk.id = source_chunk.chunk_id
          AND chunk.document_id = document.id

         LEFT JOIN knowledge_nodes entity
           ON entity.id = evidence.node_id
          AND entity.organization_id = evidence.organization_id

         LEFT JOIN knowledge_edges edge
           ON edge.id = evidence.edge_id
          AND edge.organization_id = evidence.organization_id

         LEFT JOIN knowledge_nodes source_node
           ON source_node.id = edge.source_id
          AND source_node.organization_id = edge.organization_id

         LEFT JOIN knowledge_nodes target_node
           ON target_node.id = edge.target_id
          AND target_node.organization_id = edge.organization_id

         WHERE evidence.organization_id = $1::uuid
           AND evidence.status IN ('active', 'disputed')

           -- Team document permissions.
           AND (
             document.team_id IS NULL
             OR $4::boolean = TRUE
             OR EXISTS (
               SELECT 1
               FROM team_members member
               WHERE member.team_id = document.team_id
                 AND member.user_id = $5::uuid
             )
           )

           -- Respect the selected document scope.
           AND (
             $6::uuid[] IS NULL
             OR document.id = ANY($6::uuid[])
           )

           -- Respect a selected team while retaining public documents.
           AND (
             $7::uuid IS NULL
             OR document.team_id IS NULL
             OR document.team_id = $7::uuid
           )

           -- Relationship endpoints must also have evidence
           -- in the same accessible source document.
           AND (
             evidence.node_id IS NOT NULL

             OR (
               edge.id IS NOT NULL

               AND EXISTS (
                 SELECT 1
                 FROM knowledge_evidence source_evidence
                 WHERE source_evidence.organization_id = evidence.organization_id
                   AND source_evidence.node_id = edge.source_id
                   AND source_evidence.document_id = document.id
                   AND source_evidence.status IN ('active', 'disputed')
               )

               AND EXISTS (
                 SELECT 1
                 FROM knowledge_evidence target_evidence
                 WHERE target_evidence.organization_id = evidence.organization_id
                   AND target_evidence.node_id = edge.target_id
                   AND target_evidence.document_id = document.id
                   AND target_evidence.status IN ('active', 'disputed')
               )
             )
           )
       ),

       ranked AS (
         SELECT
           candidates.*,

           (
             (
               semantic_score * 0.78
               + LEAST(lexical_score, 1.0) * 0.22
             )
             * GREATEST(
                 0::double precision,
                 LEAST(1::double precision, confidence::double precision)
               )
             * CASE
                 WHEN evidence_status = 'disputed' THEN 0.65
                 ELSE 1.0
               END
           )::double precision AS relevance_score

         FROM candidates

         WHERE semantic_score >= 0.18
            OR lexical_score > 0
       )

       SELECT *
       FROM ranked
       ORDER BY relevance_score DESC,
                confidence DESC,
                last_seen_at DESC
       LIMIT $8`,
      [
        input.organizationId,
        vector,
        query,
        privileged,
        input.userId,
        documentIds,
        input.teamId ?? null,
        limit,
      ],
    );

    const sources = result.rows.map((row, index) => ({
      citationId: `K${index + 1}`,
      evidenceId: row.evidence_id,
      evidenceType: row.evidence_type,
      status: row.evidence_status,
      sourceVerified: row.source_verified === true,

      confidence: Number(row.confidence),
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,

      documentId: row.document_id,
      documentName: row.document_name,
      documentType: row.document_type,

      chunkId: row.chunk_id,
      chunkIndex: row.chunk_index,
      excerpt: row.excerpt,

      entity: row.entity_id
        ? {
            id: row.entity_id,
            name: row.entity_label,
            type: row.entity_type,
          }
        : null,

      relationship: row.edge_id
        ? {
            id: row.edge_id,
            sourceId: row.source_node_id,
            targetId: row.target_node_id,
            source: row.source_label,
            type: row.relationship,
            target: row.target_label,
          }
        : null,

      semanticScore: Number(row.semantic_score),
      lexicalScore: Number(row.lexical_score),
      relevanceScore: Number(row.relevance_score),
    }));

    return {
      query,
      total: sources.length,
      retrievalMode: embedding ? 'hybrid' : 'full_text',
      sources,
    };
  }

  async retrieveUnified(input: RetrievalRequest) {
    const documents = await this.retrieve(input);
    const query = String(input.query ?? '').trim();
    const requestedLimit = Number(input.limit ?? 8);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(20, Math.max(1, Math.floor(requestedLimit)))
      : 8;
    const privileged = ['owner', 'admin', 'super_admin'].includes(
      String(input.role ?? '').toLowerCase(),
    );

    const structured = await this.db.query<StructuredRetrievalRow>(
      `WITH search_terms AS (
         SELECT plainto_tsquery('english', $2) AS query
       ),
       matches AS (
         SELECT 'task'::text AS source_type,
                task.id AS source_id,
                task.title,
                LEFT(COALESCE(task.description, ''), 1600) AS excerpt,
                task.updated_at,
                COALESCE(task.team_id, project.team_id) AS team_id,
                ts_rank_cd(
                  to_tsvector('english', concat_ws(' ', task.title, task.description, task.status, task.priority)),
                  search_terms.query
                )::double precision AS relevance_score
           FROM tasks task
           LEFT JOIN projects project
             ON project.id = task.project_id
            AND project.organization_id = task.organization_id
           CROSS JOIN search_terms
          WHERE task.organization_id = $1::uuid
            AND to_tsvector('english', concat_ws(' ', task.title, task.description, task.status, task.priority))
                @@ search_terms.query
            AND (
              COALESCE(task.team_id, project.team_id) IS NULL
              OR $3::boolean = TRUE
              OR EXISTS (
                SELECT 1 FROM team_members member
                 WHERE member.team_id = COALESCE(task.team_id, project.team_id)
                   AND member.user_id = $4::uuid
              )
            )
            AND ($5::uuid IS NULL OR COALESCE(task.team_id, project.team_id) IS NULL
                 OR COALESCE(task.team_id, project.team_id) = $5::uuid)

         UNION ALL

         SELECT 'meeting'::text,
                meeting.id,
                meeting.title,
                LEFT(COALESCE(analysis.summary, meeting.summary, ''), 1600),
                meeting.updated_at,
                meeting.team_id,
                ts_rank_cd(
                  to_tsvector('english', concat_ws(' ', meeting.title, analysis.summary, meeting.summary)),
                  search_terms.query
                )::double precision
           FROM meetings meeting
           LEFT JOIN LATERAL (
             SELECT item.summary
               FROM meeting_analyses item
              WHERE item.organization_id = meeting.organization_id
                AND item.meeting_id = meeting.id
              ORDER BY item.created_at DESC
              LIMIT 1
           ) analysis ON TRUE
           CROSS JOIN search_terms
          WHERE meeting.organization_id = $1::uuid
            AND to_tsvector('english', concat_ws(' ', meeting.title, analysis.summary, meeting.summary))
                @@ search_terms.query
            AND (
              meeting.team_id IS NULL
              OR $3::boolean = TRUE
              OR EXISTS (
                SELECT 1 FROM team_members member
                 WHERE member.team_id = meeting.team_id
                   AND member.user_id = $4::uuid
              )
            )
            AND ($5::uuid IS NULL OR meeting.team_id IS NULL OR meeting.team_id = $5::uuid)

         UNION ALL

         SELECT 'decision'::text,
                decision.id,
                decision.title,
                LEFT(COALESCE(decision.description, decision.rationale, ''), 1600),
                decision.updated_at,
                decision.team_id,
                ts_rank_cd(
                  to_tsvector('english', concat_ws(
                    ' ', decision.title, decision.description, decision.rationale,
                    decision.decision_type, decision.status
                  )),
                  search_terms.query
                )::double precision
           FROM knowledge_decisions decision
           CROSS JOIN search_terms
          WHERE decision.organization_id = $1::uuid
            AND decision.status IN ('proposed', 'approved', 'implemented', 'reviewed')
            AND to_tsvector('english', concat_ws(
                  ' ', decision.title, decision.description, decision.rationale,
                  decision.decision_type, decision.status
                )) @@ search_terms.query
            AND (
              decision.team_id IS NULL
              OR $3::boolean = TRUE
              OR EXISTS (
                SELECT 1 FROM team_members member
                 WHERE member.team_id = decision.team_id
                   AND member.user_id = $4::uuid
              )
            )
            AND ($5::uuid IS NULL OR decision.team_id IS NULL OR decision.team_id = $5::uuid)

         UNION ALL

         SELECT 'financial_transaction'::text,
                transaction.id,
                concat(transaction.transaction_type, ' - ', transaction.transaction_date::text),
                LEFT(concat_ws(
                  ' ', transaction.description, transaction.transaction_type,
                  transaction.amount::text, transaction.currency
                ), 1600),
                transaction.created_at,
                NULL::uuid,
                ts_rank_cd(
                  to_tsvector('english', concat_ws(
                    ' ', transaction.description, transaction.transaction_type,
                    transaction.amount::text, transaction.currency
                  )),
                  search_terms.query
                )::double precision
           FROM executive_financial_transactions transaction
           CROSS JOIN search_terms
          WHERE transaction.organization_id = $1::uuid
            AND $3::boolean = TRUE
            AND to_tsvector('english', concat_ws(
                  ' ', transaction.description, transaction.transaction_type,
                  transaction.amount::text, transaction.currency
                )) @@ search_terms.query
       )
       SELECT source_type, source_id, title, excerpt, updated_at, team_id, relevance_score
         FROM matches
        ORDER BY relevance_score DESC, updated_at DESC
        LIMIT $6`,
      [
        input.organizationId,
        query,
        privileged,
        input.userId,
        input.teamId ?? null,
        limit,
      ],
    );

    const sources = [
      ...documents.sources.map((source) => ({
        citationId: '',
        sourceType: 'document',
        sourceId: source.documentId,
        title: source.documentName,
        excerpt: source.excerpt,
        relevanceScore: source.relevanceScore,
        source,
      })),
      ...structured.rows.map((row) => ({
        citationId: '',
        sourceType: row.source_type,
        sourceId: row.source_id,
        title: row.title,
        excerpt: row.excerpt,
        relevanceScore: Number(row.relevance_score),
        teamId: row.team_id,
        updatedAt: row.updated_at,
      })),
    ]
      .sort((left, right) => right.relevanceScore - left.relevanceScore)
      .slice(0, limit)
      .map((source, index) => ({ ...source, citationId: `S${index + 1}` }));

    return {
      query,
      total: sources.length,
      retrievalMode: documents.retrievalMode,
      sources,
    };
  }
}