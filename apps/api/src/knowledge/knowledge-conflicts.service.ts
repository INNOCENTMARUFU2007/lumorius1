import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type KnowledgeConflictStatus =
  | 'proposed'
  | 'confirmed'
  | 'dismissed'
  | 'resolved';

interface ConflictListRow extends Record<string, unknown> {
  id: string;
  organizationId: string;
  claimAId: string;
  claimBId: string;
  conflictKey: string;
  conflictType: string;
  status: KnowledgeConflictStatus;
  detectionReason: string;
  firstDetectedAt: Date | string;
  lastDetectedAt: Date | string;
  reviewedAt: Date | string | null;
  resolutionNote: string | null;
  claimASubject: string;
  claimAPredicate: string;
  claimAObject: string;
  claimAValueType: string;
  claimAIsNegated: boolean;
  claimAConfidence: number | string;
  claimAEvidence: unknown;
  claimBSubject: string;
  claimBPredicate: string;
  claimBObject: string;
  claimBValueType: string;
  claimBIsNegated: boolean;
  claimBConfidence: number | string;
  claimBEvidence: unknown;
  totalCount: number | string;
}

@Injectable()
export class KnowledgeConflictsService {
  constructor(private readonly db: DatabaseService) {}

  private isPrivileged(role: string): boolean {
    return ['owner', 'admin', 'super_admin'].includes(
      String(role ?? '').toLowerCase(),
    );
  }

  private jsonArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  async detectConflicts(
    organizationId: string,
    userId: string,
    role: string,
  ): Promise<{ detected: number; status: 'proposed'; message: string }> {
    if (!organizationId || !userId) {
      throw new BadRequestException('Authenticated organization and user are required.');
    }

    const result = await this.db.query<{ id: string }>(
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
       visible_claims AS MATERIALIZED (
         SELECT DISTINCT evidence.claim_id
         FROM knowledge_claim_evidence evidence
         JOIN accessible_documents document
           ON document.id = evidence.document_id
         WHERE evidence.organization_id = $1::uuid
       ),
       candidate_pairs AS (
         SELECT
           a.organization_id,
           a.id AS claim_a_id,
           b.id AS claim_b_id,
           CASE
             WHEN a.object_key = b.object_key
              AND a.is_negated <> b.is_negated
             THEN 'polarity_mismatch'
             ELSE 'value_mismatch'
           END AS conflict_type
         FROM knowledge_claims a
         JOIN knowledge_claims b
           ON b.organization_id = a.organization_id
          AND b.subject_key = a.subject_key
          AND b.predicate_key = a.predicate_key
          AND b.value_type = a.value_type
          AND b.id > a.id
         JOIN visible_claims visible_a ON visible_a.claim_id = a.id
         JOIN visible_claims visible_b ON visible_b.claim_id = b.id
         WHERE a.organization_id = $1::uuid
           AND a.status = 'active'
           AND b.status = 'active'
           AND (
             a.object_key <> b.object_key
             OR a.is_negated <> b.is_negated
           )
       )
       INSERT INTO knowledge_conflicts (
         organization_id,
         claim_a_id,
         claim_b_id,
         conflict_key,
         conflict_type,
         detection_reason
       )
       SELECT
         pair.organization_id,
         pair.claim_a_id,
         pair.claim_b_id,
         md5(
           LEAST(pair.claim_a_id::text, pair.claim_b_id::text)
           || ':' || GREATEST(pair.claim_a_id::text, pair.claim_b_id::text)
           || ':' || pair.conflict_type
         ),
         pair.conflict_type,
         CASE
           WHEN pair.conflict_type = 'polarity_mismatch'
           THEN 'The claims share a subject, predicate and value but differ in negation. This is a potential conflict and requires human review.'
           ELSE 'The claims share a subject, predicate and value type but record different values. A historical change, time period or operating context may explain the difference; human review is required.'
         END
       FROM candidate_pairs pair
       ON CONFLICT (organization_id, conflict_key)
       DO UPDATE SET
         last_detected_at = NOW(),
         detection_reason = EXCLUDED.detection_reason,
         updated_at = NOW()
       RETURNING id`,
      [organizationId, this.isPrivileged(role), userId],
    );

    return {
      detected: result.rowCount ?? result.rows.length,
      status: 'proposed',
      message: 'Differences are recorded as proposed conflicts. No claim was automatically confirmed, dismissed or overwritten.',
    };
  }

  async listConflicts(
    organizationId: string,
    userId: string,
    role: string,
    options: { status?: string; limit?: number; offset?: number } = {},
  ) {
    if (!organizationId || !userId) {
      throw new BadRequestException('Authenticated organization and user are required.');
    }

    const allowedStatuses = new Set([
      'proposed', 'confirmed', 'dismissed', 'resolved',
    ]);
    const status = options.status?.trim() || null;
    if (status && !allowedStatuses.has(status)) {
      throw new BadRequestException('Invalid conflict status filter.');
    }

    const requestedLimit = Number(options.limit ?? 25);
    const requestedOffset = Number(options.offset ?? 0);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
      : 25;
    const offset = Number.isFinite(requestedOffset)
      ? Math.max(0, Math.trunc(requestedOffset))
      : 0;
    const privileged = this.isPrivileged(role);

    const result = await this.db.query<ConflictListRow>(
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
       visible_claims AS MATERIALIZED (
         SELECT DISTINCT evidence.claim_id
         FROM knowledge_claim_evidence evidence
         JOIN accessible_documents document
           ON document.id = evidence.document_id
         WHERE evidence.organization_id = $1::uuid
       )
       SELECT
         conflict.id,
         conflict.organization_id AS "organizationId",
         conflict.claim_a_id AS "claimAId",
         conflict.claim_b_id AS "claimBId",
         conflict.conflict_key AS "conflictKey",
         conflict.conflict_type AS "conflictType",
         conflict.status,
         conflict.detection_reason AS "detectionReason",
         conflict.first_detected_at AS "firstDetectedAt",
         conflict.last_detected_at AS "lastDetectedAt",
         conflict.reviewed_at AS "reviewedAt",
         conflict.resolution_note AS "resolutionNote",
         claim_a.subject_text AS "claimASubject",
         claim_a.predicate AS "claimAPredicate",
         claim_a.object_text AS "claimAObject",
         claim_a.value_type AS "claimAValueType",
         claim_a.is_negated AS "claimAIsNegated",
         claim_a.confidence AS "claimAConfidence",
         COALESCE((
           SELECT json_agg(
             json_build_object(
               'id', evidence_rows.id,
               'documentId', evidence_rows.document_id,
               'documentName', evidence_rows.document_name,
               'quote', evidence_rows.evidence_quote,
               'stance', evidence_rows.stance,
               'confidence', evidence_rows.confidence,
               'sourceChunkIds', evidence_rows.source_chunk_ids,
               'lastSeenAt', evidence_rows.last_seen_at
             ) ORDER BY evidence_rows.last_seen_at DESC
           )
           FROM (
             SELECT
               evidence.id,
               evidence.document_id,
               document.name AS document_name,
               evidence.evidence_quote,
               evidence.stance,
               evidence.confidence,
               evidence.source_chunk_ids,
               evidence.last_seen_at
             FROM knowledge_claim_evidence evidence
             JOIN accessible_documents accessible
               ON accessible.id = evidence.document_id
             JOIN documents document
               ON document.id = evidence.document_id
              AND document.organization_id = evidence.organization_id
             WHERE evidence.organization_id = conflict.organization_id
               AND evidence.claim_id = claim_a.id
             ORDER BY evidence.last_seen_at DESC
             LIMIT 10
           ) evidence_rows
         ), '[]'::json) AS "claimAEvidence",
         claim_b.subject_text AS "claimBSubject",
         claim_b.predicate AS "claimBPredicate",
         claim_b.object_text AS "claimBObject",
         claim_b.value_type AS "claimBValueType",
         claim_b.is_negated AS "claimBIsNegated",
         claim_b.confidence AS "claimBConfidence",
         COALESCE((
           SELECT json_agg(
             json_build_object(
               'id', evidence_rows.id,
               'documentId', evidence_rows.document_id,
               'documentName', evidence_rows.document_name,
               'quote', evidence_rows.evidence_quote,
               'stance', evidence_rows.stance,
               'confidence', evidence_rows.confidence,
               'sourceChunkIds', evidence_rows.source_chunk_ids,
               'lastSeenAt', evidence_rows.last_seen_at
             ) ORDER BY evidence_rows.last_seen_at DESC
           )
           FROM (
             SELECT
               evidence.id,
               evidence.document_id,
               document.name AS document_name,
               evidence.evidence_quote,
               evidence.stance,
               evidence.confidence,
               evidence.source_chunk_ids,
               evidence.last_seen_at
             FROM knowledge_claim_evidence evidence
             JOIN accessible_documents accessible
               ON accessible.id = evidence.document_id
             JOIN documents document
               ON document.id = evidence.document_id
              AND document.organization_id = evidence.organization_id
             WHERE evidence.organization_id = conflict.organization_id
               AND evidence.claim_id = claim_b.id
             ORDER BY evidence.last_seen_at DESC
             LIMIT 10
           ) evidence_rows
         ), '[]'::json) AS "claimBEvidence",
         COUNT(*) OVER()::int AS "totalCount"
       FROM knowledge_conflicts conflict
       JOIN knowledge_claims claim_a
         ON claim_a.organization_id = conflict.organization_id
        AND claim_a.id = conflict.claim_a_id
       JOIN knowledge_claims claim_b
         ON claim_b.organization_id = conflict.organization_id
        AND claim_b.id = conflict.claim_b_id
       JOIN visible_claims visible_a ON visible_a.claim_id = claim_a.id
       JOIN visible_claims visible_b ON visible_b.claim_id = claim_b.id
       WHERE conflict.organization_id = $1::uuid
         AND ($4::text IS NULL OR conflict.status = $4)
       ORDER BY
         CASE conflict.status
           WHEN 'proposed' THEN 0
           WHEN 'confirmed' THEN 1
           WHEN 'resolved' THEN 2
           ELSE 3
         END,
         conflict.last_detected_at DESC
       LIMIT $5 OFFSET $6`,
      [organizationId, privileged, userId, status, limit, offset],
    );

    const rows = result.rows ?? [];
    return {
      items: rows.map(row => ({
        id: row.id,
        status: row.status,
        conflictType: row.conflictType,
        conflictKey: row.conflictKey,
        detectionReason: row.detectionReason,
        firstDetectedAt: row.firstDetectedAt,
        lastDetectedAt: row.lastDetectedAt,
        reviewedAt: row.reviewedAt,
        resolutionNote: row.resolutionNote,
        claimA: {
          id: row.claimAId,
          subject: row.claimASubject,
          predicate: row.claimAPredicate,
          object: row.claimAObject,
          valueType: row.claimAValueType,
          isNegated: row.claimAIsNegated,
          confidence: Number(row.claimAConfidence),
          evidence: this.jsonArray(row.claimAEvidence),
        },
        claimB: {
          id: row.claimBId,
          subject: row.claimBSubject,
          predicate: row.claimBPredicate,
          object: row.claimBObject,
          valueType: row.claimBValueType,
          isNegated: row.claimBIsNegated,
          confidence: Number(row.claimBConfidence),
          evidence: this.jsonArray(row.claimBEvidence),
        },
      })),
      total: rows.length ? Number(rows[0].totalCount) : 0,
      limit,
      offset,
    };
  }

  async reviewConflict(
    conflictId: string,
    organizationId: string,
    userId: string,
    role: string,
    nextStatus: string,
    note?: string,
  ) {
    if (!['confirmed', 'dismissed', 'resolved'].includes(String(nextStatus))) {
      throw new BadRequestException('Review status must be confirmed, dismissed or resolved.');
    }
    const cleanNote = String(note ?? '').trim().slice(0, 2000);
    if (nextStatus === 'resolved' && cleanNote.length < 8) {
      throw new BadRequestException('A resolution note of at least 8 characters is required.');
    }
    if (!organizationId || !userId || !conflictId) {
      throw new BadRequestException('Conflict, organization and reviewer IDs are required.');
    }

    return this.db.transaction(async client => {
      const locked = await client.query<{
        id: string;
        status: KnowledgeConflictStatus;
      }>(
        `WITH accessible_documents AS MATERIALIZED (
           SELECT document.id
           FROM documents document
           WHERE document.organization_id = $1::uuid
             AND document.status::text = 'indexed'
             AND (
               document.team_id IS NULL
               OR $3::boolean = TRUE
               OR EXISTS (
                 SELECT 1
                 FROM team_members member
                 WHERE member.team_id = document.team_id
                   AND member.user_id = $2::uuid
               )
             )
         )
         SELECT conflict.id, conflict.status
         FROM knowledge_conflicts conflict
         WHERE conflict.organization_id = $1::uuid
           AND conflict.id = $4::uuid
           AND EXISTS (
             SELECT 1
             FROM knowledge_claim_evidence evidence
             JOIN accessible_documents document
               ON document.id = evidence.document_id
             WHERE evidence.organization_id = conflict.organization_id
               AND evidence.claim_id = conflict.claim_a_id
           )
           AND EXISTS (
             SELECT 1
             FROM knowledge_claim_evidence evidence
             JOIN accessible_documents document
               ON document.id = evidence.document_id
             WHERE evidence.organization_id = conflict.organization_id
               AND evidence.claim_id = conflict.claim_b_id
           )
         FOR UPDATE OF conflict`,
        [organizationId, userId, this.isPrivileged(role), conflictId],
      );

      const current = locked.rows[0];
      if (!current) {
        throw new NotFoundException('Conflict not found or not accessible.');
      }

      const allowedTransition =
        (current.status === 'proposed' &&
          (nextStatus === 'confirmed' || nextStatus === 'dismissed')) ||
        (current.status === 'confirmed' && nextStatus === 'resolved');

      if (!allowedTransition) {
        throw new ConflictException(
          `Conflict cannot transition from ${current.status} to ${nextStatus}.`,
        );
      }

      const updated = await client.query<{
        id: string;
        status: KnowledgeConflictStatus;
        reviewed_at: Date | string;
        resolution_note: string | null;
      }>(
        `UPDATE knowledge_conflicts
            SET status = $1,
                reviewed_by_id = $2::uuid,
                reviewed_at = NOW(),
                resolution_note = CASE
                  WHEN $1 = 'resolved' THEN $3
                  ELSE resolution_note
                END,
                updated_at = NOW()
          WHERE organization_id = $4::uuid
            AND id = $5::uuid
          RETURNING id, status, reviewed_at, resolution_note`,
        [nextStatus, userId, cleanNote || null, organizationId, conflictId],
      );

      if (!updated.rows[0]) {
        throw new ConflictException('Conflict review update did not persist.');
      }

      await client.query(
        `INSERT INTO knowledge_conflict_reviews (
           organization_id,
           conflict_id,
           reviewer_id,
           previous_status,
           new_status,
           review_note
         )
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)`,
        [
          organizationId,
          conflictId,
          userId,
          current.status,
          nextStatus,
          cleanNote || null,
        ],
      );

      return {
        id: updated.rows[0].id,
        status: updated.rows[0].status,
        reviewedAt: updated.rows[0].reviewed_at,
        resolutionNote: updated.rows[0].resolution_note,
      };
    });
  }

  async getReviewHistory(
    conflictId: string,
    organizationId: string,
    userId: string,
    role: string,
  ) {
    if (!organizationId || !userId || !conflictId) {
      throw new BadRequestException('Conflict, organization and user IDs are required.');
    }

    const result = await this.db.query(
      `WITH accessible_documents AS MATERIALIZED (
         SELECT document.id
         FROM documents document
         WHERE document.organization_id = $1::uuid
           AND document.status::text = 'indexed'
           AND (
             document.team_id IS NULL
             OR $3::boolean = TRUE
             OR EXISTS (
               SELECT 1
               FROM team_members member
               WHERE member.team_id = document.team_id
                 AND member.user_id = $2::uuid
             )
           )
       )
       SELECT
         review.id,
         review.previous_status AS "previousStatus",
         review.new_status AS "newStatus",
         review.review_note AS "reviewNote",
         review.created_at AS "createdAt",
         review.reviewer_id AS "reviewerId",
         reviewer.name AS "reviewerName",
         reviewer.email AS "reviewerEmail"
       FROM knowledge_conflict_reviews review
       JOIN knowledge_conflicts conflict
         ON conflict.organization_id = review.organization_id
        AND conflict.id = review.conflict_id
       LEFT JOIN users reviewer ON reviewer.id = review.reviewer_id
       WHERE review.organization_id = $1::uuid
         AND review.conflict_id = $4::uuid
         AND EXISTS (
           SELECT 1
           FROM knowledge_claim_evidence evidence
           JOIN accessible_documents document
             ON document.id = evidence.document_id
           WHERE evidence.organization_id = conflict.organization_id
             AND evidence.claim_id = conflict.claim_a_id
         )
         AND EXISTS (
           SELECT 1
           FROM knowledge_claim_evidence evidence
           JOIN accessible_documents document
             ON document.id = evidence.document_id
           WHERE evidence.organization_id = conflict.organization_id
             AND evidence.claim_id = conflict.claim_b_id
         )
       ORDER BY review.created_at DESC`,
      [organizationId, userId, this.isPrivileged(role), conflictId],
    );

    return result.rows;
  }
}