import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

interface AnalyticsRow extends Record<string, unknown> {
  indexedDocuments: number | string;
  entities: number | string;
  relationships: number | string;
  evidenceRecords: number | string;
  activeEvidence: number | string;
  disputedEvidence: number | string;
  supersededEvidence: number | string;
  entityAliases: number | string;
  completedExtractions: number | string;
  pendingExtractions: number | string;
  failedExtractions: number | string;
  extractionCoveragePercent: number | string;
  evidenceLast7Days: number | string;
  evidenceLast30Days: number | string;
  entityTypes: unknown;
}

@Injectable()
export class KnowledgeAnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async getAnalytics(
    organizationId: string,
    userId: string,
    role: string,
  ) {
    if (!organizationId || !userId) {
      throw new Error('Authenticated organization and user are required.');
    }

    const privileged = [
      'owner',
      'admin',
      'super_admin',
    ].includes(String(role ?? '').toLowerCase());

    const result = await this.db.query<AnalyticsRow>(
      `WITH accessible_documents AS MATERIALIZED (
         SELECT document.id
         FROM documents document
         WHERE document.organization_id = $1::uuid
           AND document.status::text = 'indexed'
           AND (
             document.team_id IS NULL
             OR $2::boolean = TRUE
             OR EXISTS (
               SELECT 1
               FROM team_members member
               WHERE member.team_id = document.team_id
                 AND member.user_id = $3::uuid
             )
           )
       ),

       node_evidence AS MATERIALIZED (
         SELECT evidence.*
         FROM knowledge_evidence evidence
         JOIN accessible_documents document
           ON document.id = evidence.document_id
         WHERE evidence.organization_id = $1::uuid
           AND evidence.node_id IS NOT NULL
       ),

       edge_evidence AS MATERIALIZED (
         SELECT evidence.*
         FROM knowledge_evidence evidence
         JOIN accessible_documents document
           ON document.id = evidence.document_id
         JOIN knowledge_edges edge
           ON edge.id = evidence.edge_id
          AND edge.organization_id = evidence.organization_id
         WHERE evidence.organization_id = $1::uuid
           AND evidence.edge_id IS NOT NULL

           AND EXISTS (
             SELECT 1
             FROM node_evidence source_evidence
             WHERE source_evidence.organization_id = evidence.organization_id
               AND source_evidence.node_id = edge.source_id
               AND source_evidence.document_id = evidence.document_id
               AND source_evidence.status IN ('active', 'disputed')
           )

           AND EXISTS (
             SELECT 1
             FROM node_evidence target_evidence
             WHERE target_evidence.organization_id = evidence.organization_id
               AND target_evidence.node_id = edge.target_id
               AND target_evidence.document_id = evidence.document_id
               AND target_evidence.status IN ('active', 'disputed')
           )
       ),

       eligible_nodes AS (
         SELECT DISTINCT node_id
         FROM node_evidence
         WHERE status IN ('active', 'disputed')
       ),

       eligible_edges AS (
         SELECT DISTINCT edge_id
         FROM edge_evidence
         WHERE status IN ('active', 'disputed')
       ),

       evidence_population AS (
         SELECT
           document_id,
           status,
           last_seen_at
         FROM node_evidence

         UNION ALL

         SELECT
           document_id,
           status,
           last_seen_at
         FROM edge_evidence
       ),

       latest_runs AS (
         SELECT DISTINCT ON (run.document_id)
           run.document_id,
           run.status
         FROM knowledge_extraction_runs run
         JOIN accessible_documents document
           ON document.id = run.document_id
         WHERE run.organization_id = $1::uuid
         ORDER BY
           run.document_id,
           run.extraction_version DESC,
           run.updated_at DESC
       ),

       entity_type_counts AS (
         SELECT
           node.type,
           COUNT(DISTINCT node.id)::int AS entity_count
         FROM knowledge_nodes node
         JOIN eligible_nodes eligible
           ON eligible.node_id = node.id
         WHERE node.organization_id = $1::uuid
         GROUP BY node.type
       )

       SELECT
         (SELECT COUNT(*)::int
          FROM accessible_documents) AS "indexedDocuments",

         (SELECT COUNT(*)::int
          FROM eligible_nodes) AS entities,

         (SELECT COUNT(*)::int
          FROM eligible_edges) AS relationships,

         (SELECT COUNT(*)::int
          FROM evidence_population) AS "evidenceRecords",

         (SELECT COUNT(*)::int
          FROM evidence_population
          WHERE status = 'active') AS "activeEvidence",

         (SELECT COUNT(*)::int
          FROM evidence_population
          WHERE status = 'disputed') AS "disputedEvidence",

         (SELECT COUNT(*)::int
          FROM evidence_population
          WHERE status = 'superseded') AS "supersededEvidence",

         (SELECT COUNT(DISTINCT alias.id)::int
          FROM knowledge_entity_aliases alias
          JOIN eligible_nodes eligible
            ON eligible.node_id = alias.node_id
          WHERE alias.organization_id = $1::uuid) AS "entityAliases",

         (SELECT COUNT(*)::int
          FROM latest_runs
          WHERE status = 'completed') AS "completedExtractions",

         (SELECT COUNT(*)::int
          FROM latest_runs
          WHERE status IN ('pending', 'processing')) AS "pendingExtractions",

         (SELECT COUNT(*)::int
          FROM latest_runs
          WHERE status = 'failed') AS "failedExtractions",

         CASE
           WHEN (SELECT COUNT(*) FROM accessible_documents) = 0
           THEN 0
           ELSE ROUND(
             100.0 *
             (SELECT COUNT(*) FROM latest_runs WHERE status = 'completed')
             /
             (SELECT COUNT(*) FROM accessible_documents),
             1
           )
         END AS "extractionCoveragePercent",

         (SELECT COUNT(*)::int
          FROM evidence_population
          WHERE last_seen_at >= NOW() - INTERVAL '7 days')
          AS "evidenceLast7Days",

         (SELECT COUNT(*)::int
          FROM evidence_population
          WHERE last_seen_at >= NOW() - INTERVAL '30 days')
          AS "evidenceLast30Days",

         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'type', type,
                 'count', entity_count
               )
               ORDER BY entity_count DESC, type ASC
             )
             FROM entity_type_counts
           ),
           '[]'::json
         ) AS "entityTypes"`,
      [organizationId, privileged, userId],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error('Knowledge analytics query returned no result.');
    }

    const number = (value: unknown): number => {
      const parsed = Number(value ?? 0);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const entityTypes = Array.isArray(row.entityTypes)
      ? row.entityTypes.map((item: unknown) => {
          const entry = item as Record<string, unknown>;

          return {
            type: String(entry.type ?? 'unknown'),
            count: number(entry.count),
          };
        })
      : [];

    return {
      indexedDocuments: number(row.indexedDocuments),
      entities: number(row.entities),
      relationships: number(row.relationships),
      evidenceRecords: number(row.evidenceRecords),
      activeEvidence: number(row.activeEvidence),
      disputedEvidence: number(row.disputedEvidence),
      supersededEvidence: number(row.supersededEvidence),
      entityAliases: number(row.entityAliases),
      completedExtractions: number(row.completedExtractions),
      pendingExtractions: number(row.pendingExtractions),
      failedExtractions: number(row.failedExtractions),
      extractionCoveragePercent: number(row.extractionCoveragePercent),
      evidenceLast7Days: number(row.evidenceLast7Days),
      evidenceLast30Days: number(row.evidenceLast30Days),
      entityTypes,
    };
  }
}