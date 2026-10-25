import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly db: DatabaseService,
    private readonly aiService: AiService,
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
  ) {
    const id = uuidv4();
    let embedding: number[] | null = null;

    try {
      const text = `${dto.name} ${dto.description ?? ''} ${JSON.stringify(dto.properties ?? {})}`;
      embedding = await this.aiService.createEmbedding(text);
    } catch {
      // Graph nodes can still be stored if embeddings are unavailable.
    }

    await this.db.query(
      `INSERT INTO knowledge_nodes (
         id, organization_id, label, type, description,
         source_type, source_id, properties, embedding
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        organizationId,
        dto.name,
        dto.type,
        dto.description ?? null,
        dto.sourceType ?? null,
        dto.sourceId ?? null,
        JSON.stringify(dto.properties ?? {}),
        embedding ? `[${embedding.join(',')}]` : null,
      ],
    );

    return this.findNodeById(id, organizationId);
  }

  async findNodeById(id: string, organizationId: string) {
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
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId],
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

  async getGraph(
    organizationId: string,
    query: {
      nodeId?: string;
      nodeType?: string;
      depth?: number;
      search?: string;
    },
  ) {
    let nodeIds: string[] = [];

    if (query.nodeId) {
      const seen = new Set<string>([query.nodeId]);
      let frontier = [query.nodeId];
      const parsedDepth = Number(query.depth ?? 2);
      const depth = Number.isFinite(parsedDepth)
        ? Math.max(0, Math.min(5, Math.floor(parsedDepth)))
        : 2;

      for (let level = 0; level < depth && frontier.length > 0; level += 1) {
        const res = await this.db.query(
          `SELECT DISTINCT
             CASE
               WHEN source_id = ANY($1::uuid[]) THEN target_id
               ELSE source_id
             END AS id
           FROM knowledge_edges
           WHERE organization_id = $2
             AND (
               source_id = ANY($1::uuid[])
               OR target_id = ANY($1::uuid[])
             )`,
          [frontier, organizationId],
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

    const nodeConditions = ['organization_id = $1'];
    const nodeValues: unknown[] = [organizationId];
    let idx = 2;

    if (nodeIds.length > 0) {
      nodeConditions.push(`id = ANY($${idx++}::uuid[])`);
      nodeValues.push(nodeIds);
    }

    if (query.nodeType) {
      nodeConditions.push(`type = $${idx++}`);
      nodeValues.push(query.nodeType);
    }

    if (query.search) {
      nodeConditions.push(`label ILIKE $${idx++}`);
      nodeValues.push(`%${query.search}%`);
    }

    const nodesRes = await this.db.query(
      `SELECT
         id,
         label,
         label AS name,
         type,
         description,
         properties,
         source_type,
         source_id,
         created_at,
         updated_at
       FROM knowledge_nodes
       WHERE ${nodeConditions.join(' AND ')}
       ORDER BY label ASC
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

    const relationsRes = await this.db.query(
      `SELECT
         id,
         source_id,
         target_id,
         relationship,
         weight,
         source_id AS from_node_id,
         target_id AS to_node_id,
         relationship AS relation_type,
         weight AS strength
       FROM knowledge_edges
       WHERE organization_id = $2
         AND source_id = ANY($1::uuid[])
         AND target_id = ANY($1::uuid[])
       ORDER BY created_at ASC`,
      [allNodeIds, organizationId],
    );

    return { nodes, relations: relationsRes.rows };
  }

  async semanticSearch(organizationId: string, query: string) {
    const embedding = await this.aiService.createEmbedding(query);
    if (!embedding.length) return [];

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
       ORDER BY score DESC
       LIMIT 20`,
      [organizationId, `[${embedding.join(',')}]`],
    );

    return res.rows;
  }

  async syncFromDocuments(organizationId: string) {
    const docs = await this.db.query(
      `SELECT id, name, type, created_at, uploaded_by_id
       FROM documents
       WHERE organization_id = $1 AND status = 'indexed'`,
      [organizationId],
    );

    let created = 0;

    for (const doc of docs.rows as Array<Record<string, unknown>>) {
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
          description: `${String(doc.type)} document`,
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

    return { synced: created };
  }
}
