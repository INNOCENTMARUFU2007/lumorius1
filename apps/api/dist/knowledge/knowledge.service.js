"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const database_service_1 = require("../database/database.service");
const ai_service_1 = require("../ai/ai.service");
let KnowledgeService = class KnowledgeService {
    constructor(db, aiService) {
        this.db = db;
        this.aiService = aiService;
    }
    async createNode(organizationId, dto) {
        const id = (0, uuid_1.v4)();
        let embedding = null;
        try {
            const text = `${dto.name} ${dto.description ?? ''} ${JSON.stringify(dto.properties ?? {})}`;
            embedding = await this.aiService.createEmbedding(text);
        }
        catch {
        }
        await this.db.query(`INSERT INTO knowledge_nodes (
         id, organization_id, label, type, description,
         source_type, source_id, properties, embedding
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
            id,
            organizationId,
            dto.name,
            dto.type,
            dto.description ?? null,
            dto.sourceType ?? null,
            dto.sourceId ?? null,
            JSON.stringify(dto.properties ?? {}),
            embedding ? `[${embedding.join(',')}]` : null,
        ]);
        return this.findNodeById(id, organizationId);
    }
    async findNodeById(id, organizationId) {
        const res = await this.db.query(`SELECT
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
       WHERE id = $1 AND organization_id = $2`, [id, organizationId]);
        if (!res.rows[0]) {
            throw new common_1.NotFoundException('Knowledge node not found');
        }
        return res.rows[0];
    }
    async createRelation(organizationId, dto) {
        const nodeIds = [...new Set([dto.fromNodeId, dto.toNodeId])];
        const nodes = await this.db.query(`SELECT id
       FROM knowledge_nodes
       WHERE organization_id = $1 AND id = ANY($2::uuid[])`, [organizationId, nodeIds]);
        if (nodes.rows.length !== nodeIds.length) {
            throw new common_1.NotFoundException('Source or target knowledge node not found');
        }
        const strength = dto.strength ?? 1.0;
        const existing = await this.db.query(`SELECT id
       FROM knowledge_edges
       WHERE organization_id = $1
         AND source_id = $2
         AND target_id = $3
         AND relationship = $4
       ORDER BY created_at DESC
       LIMIT 1`, [organizationId, dto.fromNodeId, dto.toNodeId, dto.relationType]);
        let relationId;
        if (existing.rows[0]) {
            relationId = String(existing.rows[0].id);
            await this.db.query(`UPDATE knowledge_edges
         SET weight = $1
         WHERE id = $2 AND organization_id = $3`, [strength, relationId, organizationId]);
        }
        else {
            relationId = (0, uuid_1.v4)();
            await this.db.query(`INSERT INTO knowledge_edges (
           id, organization_id, source_id, target_id,
           relationship, weight, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb)`, [
                relationId,
                organizationId,
                dto.fromNodeId,
                dto.toNodeId,
                dto.relationType,
                strength,
            ]);
        }
        return {
            id: relationId,
            fromNodeId: dto.fromNodeId,
            toNodeId: dto.toNodeId,
            relationType: dto.relationType,
            strength,
        };
    }
    async getGraph(organizationId, query) {
        let nodeIds = [];
        if (query.nodeId) {
            const seen = new Set([query.nodeId]);
            let frontier = [query.nodeId];
            const parsedDepth = Number(query.depth ?? 2);
            const depth = Number.isFinite(parsedDepth)
                ? Math.max(0, Math.min(5, Math.floor(parsedDepth)))
                : 2;
            for (let level = 0; level < depth && frontier.length > 0; level += 1) {
                const res = await this.db.query(`SELECT DISTINCT
             CASE
               WHEN source_id = ANY($1::uuid[]) THEN target_id
               ELSE source_id
             END AS id
           FROM knowledge_edges
           WHERE organization_id = $2
             AND (
               source_id = ANY($1::uuid[])
               OR target_id = ANY($1::uuid[])
             )`, [frontier, organizationId]);
                const nextFrontier = [];
                for (const row of res.rows) {
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
        const nodeValues = [organizationId];
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
        const nodesRes = await this.db.query(`SELECT
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
       LIMIT 200`, nodeValues);
        const nodes = nodesRes.rows;
        if (nodes.length === 0) {
            return { nodes: [], relations: [] };
        }
        const allNodeIds = nodes.map((node) => String(node.id));
        const relationsRes = await this.db.query(`SELECT
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
       ORDER BY created_at ASC`, [allNodeIds, organizationId]);
        return { nodes, relations: relationsRes.rows };
    }
    async semanticSearch(organizationId, query) {
        const embedding = await this.aiService.createEmbedding(query);
        if (!embedding.length)
            return [];
        const res = await this.db.query(`SELECT
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
       LIMIT 20`, [organizationId, `[${embedding.join(',')}]`]);
        return res.rows;
    }
    async syncFromDocuments(organizationId) {
        const docs = await this.db.query(`SELECT id, name, type, created_at, uploaded_by_id
       FROM documents
       WHERE organization_id = $1 AND status = 'indexed'`, [organizationId]);
        let created = 0;
        for (const doc of docs.rows) {
            const existing = await this.db.query(`SELECT id
         FROM knowledge_nodes
         WHERE organization_id = $1
           AND source_type = 'document'
           AND source_id = $2
         LIMIT 1`, [organizationId, doc.id]);
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
};
exports.KnowledgeService = KnowledgeService;
exports.KnowledgeService = KnowledgeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        ai_service_1.AiService])
], KnowledgeService);
//# sourceMappingURL=knowledge.service.js.map