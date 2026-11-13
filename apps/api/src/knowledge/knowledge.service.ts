import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { AiService } from '../ai/ai.service';
import { KnowledgeExtractionService } from './knowledge-extraction.service';

@Injectable()
export class KnowledgeService {
  // KNOWLEDGE EXTRACTION V2: prevents duplicate work in this API process.
  private readonly activeDocumentRuns = new Set<string>();
  private readonly logger = new Logger(KnowledgeService.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly aiService: AiService,
    @Optional()
    private readonly extractionService?: KnowledgeExtractionService,
  ) {}

  // The database column is `label`; the API keeps exposing it as `name`
  // for compatibility with the existing frontend.
  async createNode(
    organizationId: string,
    dto: {
      name: string;
      type: string;
      description?: string;
      properties?: Record<string, unknown>;
      sourceType?: string;
      sourceId?: string;
    },
    access?: { userId: string; role: string },
  ) {
    const name =
      typeof dto?.name === 'string'
        ? dto.name.normalize('NFKC').trim().replace(/\s+/g, ' ')
        : '';
    const type =
      typeof dto?.type === 'string'
        ? dto.type.normalize('NFKC').trim().toLowerCase()
        : '';

    if (!name || name.length > 500) {
      throw new BadRequestException(
        'Knowledge node name must contain 1 to 500 characters.',
      );
    }

    if (!/^[a-z][a-z0-9_-]{0,49}$/.test(type)) {
      throw new BadRequestException(
        'Knowledge node type must be a valid identifier of at most 50 characters.',
      );
    }

    const canonicalKey = name.toLowerCase();
    const accessCondition = access
      ? ` AND ${this.nodeVisibilityCondition(
          'knowledge_nodes',
          '$4',
          '$5',
        )}`
      : '';
    const lookupValues: unknown[] = [
      organizationId,
      type,
      canonicalKey,
    ];

    if (access) {
      lookupValues.push(
        ['owner', 'admin', 'super_admin'].includes(
          access.role.toLowerCase(),
        ),
        access.userId,
      );
    }

    if (type !== 'document') {
      const existing = await this.db.query<{ id: string }>(
        `SELECT knowledge_nodes.id
           FROM knowledge_nodes
          WHERE knowledge_nodes.organization_id = $1::uuid
            AND knowledge_nodes.type = $2
            AND knowledge_nodes.canonical_key = $3
            ${accessCondition}
          ORDER BY knowledge_nodes.created_at ASC, knowledge_nodes.id ASC
          LIMIT 1`,
        lookupValues,
      );

      if (existing.rows[0]?.id) {
        return this.findNodeById(existing.rows[0].id, organizationId, access);
      }
    }

    const id = uuidv4();
    let embedding: number[] | null = null;

    try {
      const text = `${name} ${dto.description ?? ''} ${JSON.stringify(dto.properties ?? {})}`;
      embedding = await this.aiService.createEmbedding(text, {
        organizationId,
        userId: access?.userId,
        feature: 'knowledge_node_embedding',
      });
    } catch (error) {
      this.logger.warn(
        `Knowledge node embedding unavailable; storing the node without a vector: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const nodeId = await this.db.transaction(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`knowledge-node:${organizationId}:${type}:${canonicalKey}`],
      );

      if (type !== 'document') {
        const existing = await client.query<{ id: string }>(
          `SELECT knowledge_nodes.id
             FROM knowledge_nodes
            WHERE knowledge_nodes.organization_id = $1::uuid
              AND knowledge_nodes.type = $2
              AND knowledge_nodes.canonical_key = $3
              ${accessCondition}
            ORDER BY knowledge_nodes.created_at ASC, knowledge_nodes.id ASC
            LIMIT 1`,
          lookupValues,
        );

        if (existing.rows[0]?.id) {
          return existing.rows[0].id;
        }
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO knowledge_nodes (
           id, organization_id, label, type, description,
           source_type, source_id, properties, embedding, canonical_key
         )
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::vector, $10)
         RETURNING id`,
        [
          id,
          organizationId,
          name,
          type,
          dto.description ?? null,
          dto.sourceType ?? null,
          dto.sourceId ?? null,
          JSON.stringify(dto.properties ?? {}),
          embedding ? `[${embedding.join(',')}]` : null,
          canonicalKey,
        ],
      );

      if (!inserted.rows[0]?.id) {
        throw new Error('Failed to create knowledge node.');
      }

      return inserted.rows[0].id;
    });

    return this.findNodeById(nodeId, organizationId, access);
  }

  async findNodeById(
    id: string,
    organizationId: string,
    access?: { userId: string; role: string },
  ) {
    const values: unknown[] = [id, organizationId];
    let accessCondition = '';

    if (access) {
      const canAccessAllTeams = [
        'owner',
        'admin',
        'super_admin',
      ].includes(access.role.toLowerCase());

      accessCondition =
        ` AND ${this.nodeVisibilityCondition(
          'knowledge_nodes',
          '$3',
          '$4',
        )}`;

      values.push(canAccessAllTeams, access.userId);
    }

    const res = await this.db.query(
      `SELECT
         id,
         label,
         label AS name,
         type,
         description,
         properties,
         organization_id,
         source_type,
         source_id,
         created_at,
         updated_at
       FROM knowledge_nodes
       WHERE id = $1
         AND organization_id = $2
         ${accessCondition}`,
      values,
    );

    if (!res.rows[0]) {
      throw new NotFoundException('Knowledge node not found');
    }

    return res.rows[0];
  }

  async createRelation(
    organizationId: string,
    dto: {
      fromNodeId: string;
      toNodeId: string;
      relationType: string;
      strength?: number;
    },
  ) {
    // Ensure both endpoints belong to this organization before creating an edge.
    const nodeIds = [...new Set([dto.fromNodeId, dto.toNodeId])];
    const nodes = await this.db.query(
      `SELECT id
       FROM knowledge_nodes
       WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
      [organizationId, nodeIds],
    );

    if (nodes.rows.length !== nodeIds.length) {
      throw new NotFoundException('Source or target knowledge node not found');
    }

    const strength = dto.strength ?? 1.0;

    // The live schema uses knowledge_edges(source_id, target_id, relationship, weight).
    // Reuse an existing matching edge so repeated requests do not create duplicates.
    const existing = await this.db.query(
      `SELECT id
       FROM knowledge_edges
       WHERE organization_id = $1
         AND source_id = $2
         AND target_id = $3
         AND relationship = $4
       ORDER BY created_at DESC
       LIMIT 1`,
      [organizationId, dto.fromNodeId, dto.toNodeId, dto.relationType],
    );

    let relationId: string;

    if (existing.rows[0]) {
      relationId = String((existing.rows[0] as Record<string, unknown>).id);
      await this.db.query(
        `UPDATE knowledge_edges
         SET weight = $1
         WHERE id = $2 AND organization_id = $3`,
        [strength, relationId, organizationId],
      );
    } else {
      relationId = uuidv4();
      await this.db.query(
        `INSERT INTO knowledge_edges (
           id, organization_id, source_id, target_id,
           relationship, weight, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb)`,
        [
          relationId,
          organizationId,
          dto.fromNodeId,
          dto.toNodeId,
          dto.relationType,
          strength,
        ],
      );
    }

    return {
      id: relationId,
      fromNodeId: dto.fromNodeId,
      toNodeId: dto.toNodeId,
      relationType: dto.relationType,
      strength,
    };
  }

// KNOWLEDGE_EVIDENCE_ACCESS_V2

  private documentTeamCondition(
    documentAlias: string,
    privilegedParam: string,
    userParam: string,
  ): string {
    return `(
      ${documentAlias}.team_id IS NULL
      OR ${privilegedParam}::boolean = TRUE
      OR EXISTS (
        SELECT 1
        FROM team_members access_member
        WHERE access_member.team_id = ${documentAlias}.team_id
          AND access_member.user_id = ${userParam}::uuid
      )
    )`;
  }

  private nodeVisibilityCondition(
    alias: string,
    privilegedParam: string,
    userParam: string,
  ): string {
    const sourceDocumentAccess = this.documentTeamCondition(
      'source_document',
      privilegedParam,
      userParam,
    );

    const evidenceDocumentAccess = this.documentTeamCondition(
      'evidence_document',
      privilegedParam,
      userParam,
    );

    return `(
      COALESCE(${alias}.source_type, '') NOT IN (
        'document',
        'document_entity'
      )

      OR (
        ${alias}.source_type = 'document'

        AND EXISTS (
          SELECT 1
          FROM documents source_document
          WHERE source_document.id = ${alias}.source_id
            AND source_document.organization_id = ${alias}.organization_id
            AND ${sourceDocumentAccess}
        )
      )

      OR (
        ${alias}.source_type = 'document_entity'

        AND (
          EXISTS (
            SELECT 1
            FROM knowledge_evidence node_evidence
            JOIN documents evidence_document
              ON evidence_document.id = node_evidence.document_id
             AND evidence_document.organization_id = node_evidence.organization_id
            WHERE node_evidence.organization_id = ${alias}.organization_id
              AND node_evidence.node_id = ${alias}.id
              AND node_evidence.status IN ('active', 'disputed')
              AND ${evidenceDocumentAccess}
          )

          OR (
            NOT EXISTS (
              SELECT 1
              FROM knowledge_evidence historical_evidence
              WHERE historical_evidence.organization_id = ${alias}.organization_id
                AND historical_evidence.node_id = ${alias}.id
            )

            AND EXISTS (
              SELECT 1
              FROM documents legacy_source_document
              WHERE legacy_source_document.id = ${alias}.source_id
                AND legacy_source_document.organization_id = ${alias}.organization_id
                AND ${this.documentTeamCondition(
                  'legacy_source_document',
                  privilegedParam,
                  userParam,
                )}
            )
          )
        )
      )
    )`;
  }

  private edgeVisibilityCondition(
    alias: string,
    privilegedParam: string,
    userParam: string,
  ): string {
    const evidenceDocumentAccess = this.documentTeamCondition(
      'edge_evidence_document',
      privilegedParam,
      userParam,
    );

    const edgeDocumentId = `COALESCE(
      NULLIF(${alias}.metadata->>'sourceDocumentId', ''),
      NULLIF(${alias}.metadata->>'lastSourceDocumentId', ''),
      (
        SELECT edge_document_node.source_id::text
        FROM knowledge_nodes edge_document_node
        WHERE edge_document_node.id = ${alias}.source_id
          AND edge_document_node.organization_id = ${alias}.organization_id
          AND edge_document_node.type = 'document'
        LIMIT 1
      )
    )`;

    return `(
      EXISTS (
        SELECT 1
        FROM knowledge_evidence edge_evidence
        JOIN documents edge_evidence_document
          ON edge_evidence_document.id = edge_evidence.document_id
         AND edge_evidence_document.organization_id = edge_evidence.organization_id
        WHERE edge_evidence.organization_id = ${alias}.organization_id
          AND edge_evidence.edge_id = ${alias}.id
          AND edge_evidence.status IN ('active', 'disputed')
          AND ${evidenceDocumentAccess}
      )

      OR (
        NOT EXISTS (
          SELECT 1
          FROM knowledge_evidence any_edge_evidence
          WHERE any_edge_evidence.organization_id = ${alias}.organization_id
            AND any_edge_evidence.edge_id = ${alias}.id
        )

        AND (
          (
            ${edgeDocumentId} IS NOT NULL

            AND EXISTS (
              SELECT 1
              FROM documents legacy_edge_document
              WHERE legacy_edge_document.id::text = ${edgeDocumentId}
                AND legacy_edge_document.organization_id = ${alias}.organization_id
                AND ${this.documentTeamCondition(
                  'legacy_edge_document',
                  privilegedParam,
                  userParam,
                )}
            )
          )

          OR (
            ${edgeDocumentId} IS NULL
            AND ${alias}.relationship <> 'CONTAINS'
          )
        )
      )
    )`;
  }
  async getGraph(
    organizationId: string,
    query: {
      nodeId?: string;
      nodeType?: string;
      depth?: number;
      search?: string;
      userId?: string;
      role?: string;
    },
  ) {
    let nodeIds: string[] = [];

    const accessEnabled = Boolean(query.userId);
    const canAccessAllTeams = [
      'owner',
      'admin',
      'super_admin',
    ].includes((query.role ?? '').toLowerCase());

    const privilegedParam = '$3';
    const userParam = '$4';

    if (query.nodeId) {
      const seen = new Set<string>([query.nodeId]);
      let frontier = [query.nodeId];

      const parsedDepth = Number(query.depth ?? 2);
      const depth = Number.isFinite(parsedDepth)
        ? Math.max(0, Math.min(5, Math.floor(parsedDepth)))
        : 2;

      for (
        let level = 0;
        level < depth && frontier.length > 0;
        level += 1
      ) {
        const traversalAccess = accessEnabled
          ? `
            AND ${this.nodeVisibilityCondition(
              'source_node',
              privilegedParam,
              userParam,
            )}
            AND ${this.nodeVisibilityCondition(
              'target_node',
              privilegedParam,
              userParam,
            )}
            AND ${this.edgeVisibilityCondition(
              'edge',
              privilegedParam,
              userParam,
            )}
          `
          : '';

        const traversalValues: unknown[] = [
          frontier,
          organizationId,
        ];

        if (accessEnabled) {
          traversalValues.push(canAccessAllTeams, query.userId);
        }

        const res = await this.db.query(
          `SELECT DISTINCT
             CASE
               WHEN edge.source_id = ANY($1::uuid[])
               THEN edge.target_id
               ELSE edge.source_id
             END AS id
           FROM knowledge_edges edge
           JOIN knowledge_nodes source_node
             ON source_node.id = edge.source_id
            AND source_node.organization_id = edge.organization_id
           JOIN knowledge_nodes target_node
             ON target_node.id = edge.target_id
            AND target_node.organization_id = edge.organization_id
           WHERE edge.organization_id = $2
             AND (
               edge.source_id = ANY($1::uuid[])
               OR edge.target_id = ANY($1::uuid[])
             )
             ${traversalAccess}`,
          traversalValues,
        );

        const nextFrontier: string[] = [];

        for (const row of res.rows as Array<Record<string, unknown>>) {
          const id = String(row.id);

          if (!seen.has(id)) {
            seen.add(id);
            nextFrontier.push(id);
          }
        }

        frontier = nextFrontier;
      }

      nodeIds = [...seen];
    }

    const nodeConditions = ['knowledge_nodes.organization_id = $1'];
    const nodeValues: unknown[] = [organizationId];
    let idx = 2;

    if (accessEnabled) {
      const privileged = `$${idx++}`;
      const user = `$${idx++}`;

      nodeConditions.push(
        this.nodeVisibilityCondition(
          'knowledge_nodes',
          privileged,
          user,
        ),
      );

      nodeValues.push(canAccessAllTeams, query.userId);
    }

    if (nodeIds.length > 0) {
      nodeConditions.push(`knowledge_nodes.id = ANY($${idx++}::uuid[])`);
      nodeValues.push(nodeIds);
    }

    if (query.nodeType) {
      nodeConditions.push(`knowledge_nodes.type = $${idx++}`);
      nodeValues.push(query.nodeType);
    }

    if (query.search) {
      nodeConditions.push(`knowledge_nodes.label ILIKE $${idx++}`);
      nodeValues.push(`%${query.search}%`);
    }

    const nodesRes = await this.db.query(
      `SELECT
         knowledge_nodes.id,
         knowledge_nodes.label,
         knowledge_nodes.label AS name,
         knowledge_nodes.type,
         knowledge_nodes.description,
         knowledge_nodes.properties,
         knowledge_nodes.source_type,
         knowledge_nodes.source_id,
         knowledge_nodes.created_at,
         knowledge_nodes.updated_at
       FROM knowledge_nodes
       WHERE ${nodeConditions.join(' AND ')}
       ORDER BY knowledge_nodes.label ASC
       LIMIT 200`,
      nodeValues,
    );

    const nodes = nodesRes.rows;

    if (nodes.length === 0) {
      return { nodes: [], relations: [] };
    }

    const allNodeIds = nodes.map(
      (node) => String((node as Record<string, unknown>).id),
    );

    const relationValues: unknown[] = [
      allNodeIds,
      organizationId,
    ];

    let relationAccess = '';

    if (accessEnabled) {
      relationAccess = `
        AND ${this.edgeVisibilityCondition(
          'edge',
          '$3',
          '$4',
        )}
      `;

      relationValues.push(canAccessAllTeams, query.userId);
    }

    const relationsRes = await this.db.query(
      `SELECT
         edge.id,
         edge.source_id,
         edge.target_id,
         edge.relationship,
         edge.weight,
         edge.source_id AS from_node_id,
         edge.target_id AS to_node_id,
         edge.relationship AS relation_type,
         edge.weight AS strength
       FROM knowledge_edges edge
       WHERE edge.organization_id = $2
         AND edge.source_id = ANY($1::uuid[])
         AND edge.target_id = ANY($1::uuid[])
         ${relationAccess}
       ORDER BY edge.created_at ASC`,
      relationValues,
    );

    return {
      nodes,
      relations: relationsRes.rows,
    };
  }
  async semanticSearch(
    organizationId: string,
    query: string,
    access?: { userId: string; role: string },
  ) {
    const embedding = await this.aiService.createEmbedding(query, {
      organizationId,
      userId: access?.userId,
      feature: 'knowledge_graph_search',
    });
    if (!embedding.length) return [];

    const values: unknown[] = [
      organizationId,
      `[${embedding.join(',')}]`,
    ];

    let accessCondition = '';

    if (access) {
      const canAccessAllTeams = [
        'owner',
        'admin',
        'super_admin',
      ].includes(access.role.toLowerCase());

      accessCondition =
        ` AND ${this.nodeVisibilityCondition(
          'knowledge_nodes',
          '$3',
          '$4',
        )}`;

      values.push(canAccessAllTeams, access.userId);
    }

    const res = await this.db.query(
      `SELECT
         id,
         label,
         label AS name,
         type,
         description,
         properties,
         1 - (embedding <=> $2::vector) AS score
       FROM knowledge_nodes
       WHERE organization_id = $1
         AND embedding IS NOT NULL
         ${accessCondition}
       ORDER BY score DESC
       LIMIT 20`,
      values,
    );

    return res.rows;
  }

  async getNodeEvidence(
    nodeId: string,
    organizationId: string,
    access: { userId: string; role: string },
  ) {
    // Confirm the entity itself is visible before returning its evidence.
    await this.findNodeById(nodeId, organizationId, access);

    const canAccessAllTeams = [
      'owner',
      'admin',
      'super_admin',
    ].includes(access.role.toLowerCase());

    const documentAccess = this.documentTeamCondition(
      'document',
      '$3',
      '$4',
    );

    const result = await this.db.query(
      `SELECT
         evidence.id AS "evidenceId",
         document.id AS "documentId",
         document.name AS "documentName",
         document.type AS "documentType",
         edge.relationship AS relationship,
         evidence.evidence_type AS "evidenceType",
         chunk.id AS "chunkId",
         chunk.chunk_index AS "chunkIndex",
         LEFT(chunk.content, 1400) AS excerpt,
         evidence.confidence AS confidence,
         evidence.source_chunk_ids AS "sourceChunkIds",
         evidence.status AS status,
         evidence.first_seen_at AS "firstSeenAt",
         evidence.last_seen_at AS "lastSeenAt",
         evidence.superseded_at AS "supersededAt"
       FROM knowledge_evidence evidence
       JOIN documents document
         ON document.id = evidence.document_id
        AND document.organization_id = evidence.organization_id
       LEFT JOIN knowledge_edges edge
         ON edge.id = evidence.edge_id
        AND edge.organization_id = evidence.organization_id
       LEFT JOIN LATERAL unnest(
         evidence.source_chunk_ids
       ) AS evidence_chunk(chunk_id) ON TRUE
       LEFT JOIN document_chunks chunk
         ON chunk.id = evidence_chunk.chunk_id
        AND chunk.document_id = document.id
       WHERE evidence.organization_id = $1::uuid
         AND (
           evidence.node_id = $2::uuid
           OR (
             edge.id IS NOT NULL
             AND (
               edge.source_id = $2::uuid
               OR edge.target_id = $2::uuid
             )
           )
         )
         AND ${documentAccess}
       ORDER BY
         document.created_at DESC,
         chunk.chunk_index ASC NULLS LAST,
         evidence.first_seen_at DESC
       LIMIT 80`,
      [
        organizationId,
        nodeId,
        canAccessAllTeams,
        access.userId,
      ],
    );

    return {
      nodeId,
      total: result.rows.length,
      sources: result.rows,
    };
  }
  async syncFromDocuments(organizationId: string) {
    const docs = await this.db.query(
      `SELECT id, name, type, created_at, uploaded_by_id
       FROM documents
       WHERE organization_id = $1
         AND status = 'indexed'
       ORDER BY created_at ASC`,
      [organizationId],
    );

    const documents = docs.rows as Array<Record<string, unknown>>;

    // Full extraction path.
    if (this.extractionService) {
      let processed = 0;
      let failed = 0;

      for (const doc of documents) {
        try {
          await this.extractionService.processDocument({
            documentId: String(doc.id),
            organizationId,
            documentName: String(doc.name ?? ''),
          });
          processed += 1;
        } catch {
          failed += 1;
        }
      }

      return {
        synced: processed,
        processed,
        failed,
        total: documents.length,
        mode: 'full_knowledge_extraction',
      };
    }

    // Legacy fallback preserves compatibility with isolated service tests.
    let created = 0;

    for (const doc of documents) {
      const existing = await this.db.query(
        `SELECT id
         FROM knowledge_nodes
         WHERE organization_id = $1
           AND source_type = 'document'
           AND source_id = $2
         LIMIT 1`,
        [organizationId, doc.id],
      );

      if (existing.rows.length === 0) {
        await this.createNode(organizationId, {
          name: String(doc.name),
          type: 'document',
          description: 'Indexed company document',
          properties: {
            uploadedById: doc.uploaded_by_id ?? null,
            createdAt: doc.created_at ?? null,
          },
          sourceType: 'document',
          sourceId: String(doc.id),
        });
        created += 1;
      }
    }

    return {
      synced: created,
      processed: 0,
      failed: 0,
      total: documents.length,
      mode: 'document_nodes_only',
    };
  }
}
