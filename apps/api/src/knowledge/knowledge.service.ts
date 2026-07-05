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

  async createNode(organizationId: string, dto: {
    name: string;
    type: string;
    description?: string;
    properties?: Record<string, unknown>;
    sourceType?: string;
    sourceId?: string;
  }) {
    const id = uuidv4();
    let embedding: number[] | null = null;

    try {
      const text = `${dto.name} ${dto.description ?? ''} ${JSON.stringify(dto.properties ?? {})}`;
      embedding = await this.aiService.createEmbedding(text);
    } catch {}

    await this.db.query(
      `INSERT INTO knowledge_nodes (id, name, type, description, properties, embedding, organization_id, source_type, source_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id, dto.name, dto.type, dto.description ?? null,
        JSON.stringify(dto.properties ?? {}),
        embedding ? `[${embedding.join(',')}]` : null,
        organizationId, dto.sourceType ?? null, dto.sourceId ?? null,
      ],
    );
    return this.findNodeById(id, organizationId);
  }

  async findNodeById(id: string, organizationId: string) {
    const res = await this.db.query(
      'SELECT id, name, type, description, properties, organization_id, source_type, source_id, created_at FROM knowledge_nodes WHERE id = $1 AND organization_id = $2',
      [id, organizationId],
    );
    if (!res.rows[0]) throw new NotFoundException('Node not found');
    return res.rows[0];
  }

  async createRelation(organizationId: string, dto: {
    fromNodeId: string; toNodeId: string; relationType: string; strength?: number;
  }) {
    const id = uuidv4();
    await this.db.query(
      `INSERT INTO knowledge_relations (id, from_node_id, to_node_id, relation_type, strength, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (from_node_id, to_node_id, relation_type) DO UPDATE SET strength = EXCLUDED.strength`,
      [id, dto.fromNodeId, dto.toNodeId, dto.relationType, dto.strength ?? 1.0, organizationId],
    );
    return { id, ...dto };
  }

  async getGraph(organizationId: string, query: {
    nodeId?: string; nodeType?: string; depth?: number; search?: string;
  }) {
    let nodeIds: string[] = [];

    if (query.nodeId) {
      nodeIds = [query.nodeId];
      const depth = query.depth ?? 2;
      for (let d = 0; d < depth; d++) {
        const res = await this.db.query(
          `SELECT DISTINCT CASE WHEN from_node_id = ANY($1) THEN to_node_id ELSE from_node_id END as id
           FROM knowledge_relations
           WHERE (from_node_id = ANY($1) OR to_node_id = ANY($1)) AND organization_id = $2`,
          [nodeIds, organizationId],
        );
        const newIds = res.rows.map((r) => (r as Record<string, string>).id);
        nodeIds = [...new Set([...nodeIds, ...newIds])];
      }
    }

    const nodeConditions = ['organization_id = $1'];
    const nodeValues: unknown[] = [organizationId];
    let idx = 2;

    if (nodeIds.length > 0) { nodeConditions.push(`id = ANY($${idx++})`); nodeValues.push(nodeIds); }
    if (query.nodeType) { nodeConditions.push(`type = $${idx++}`); nodeValues.push(query.nodeType); }
    if (query.search) { nodeConditions.push(`name ILIKE $${idx++}`); nodeValues.push(`%${query.search}%`); }

    const nodesRes = await this.db.query(
      `SELECT id, name, type, description, properties, created_at
       FROM knowledge_nodes WHERE ${nodeConditions.join(' AND ')} LIMIT 200`,
      nodeValues,
    );

    const nodes = nodesRes.rows;
    if (nodes.length === 0) return { nodes: [], relations: [] };

    const allNodeIds = nodes.map((n) => (n as Record<string, unknown>).id);
    const relationsRes = await this.db.query(
      `SELECT id, from_node_id, to_node_id, relation_type, strength
       FROM knowledge_relations
       WHERE from_node_id = ANY($1) AND to_node_id = ANY($1) AND organization_id = $2`,
      [allNodeIds, organizationId],
    );

    return { nodes, relations: relationsRes.rows };
  }

  async semanticSearch(organizationId: string, query: string) {
    const embedding = await this.aiService.createEmbedding(query);
    const res = await this.db.query(
      `SELECT id, name, type, description, properties,
              1 - (embedding <=> $2::vector) as score
       FROM knowledge_nodes
       WHERE organization_id = $1 AND embedding IS NOT NULL
       ORDER BY score DESC LIMIT 20`,
      [organizationId, `[${embedding.join(',')}]`],
    );
    return res.rows;
  }

  async syncFromDocuments(organizationId: string) {
    const docs = await this.db.query(
      `SELECT id, name, type, created_at, uploaded_by_id
       FROM documents WHERE organization_id = $1 AND status = 'indexed'`,
      [organizationId],
    );

    let created = 0;
    for (const doc of docs.rows) {
      const d = doc as Record<string, unknown>;
      const existing = await this.db.query(
        `SELECT id FROM knowledge_nodes WHERE source_type = 'document' AND source_id = $1`,
        [d.id],
      );
      if (existing.rows.length === 0) {
        await this.createNode(organizationId, {
          name: d.name as string,
          type: 'document',
          description: `${d.type} document`,
          sourceType: 'document',
          sourceId: d.id as string,
        });
        created++;
      }
    }

    return { synced: created };
  }
}
