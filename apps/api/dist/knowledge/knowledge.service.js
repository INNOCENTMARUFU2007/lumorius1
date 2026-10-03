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
        catch { }
        await this.db.query(`INSERT INTO knowledge_nodes (id, name, type, description, properties, embedding, organization_id, source_type, source_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
            id, dto.name, dto.type, dto.description ?? null,
            JSON.stringify(dto.properties ?? {}),
            embedding ? `[${embedding.join(',')}]` : null,
            organizationId, dto.sourceType ?? null, dto.sourceId ?? null,
        ]);
        return this.findNodeById(id, organizationId);
    }
    async findNodeById(id, organizationId) {
        const res = await this.db.query('SELECT id, name, type, description, properties, organization_id, source_type, source_id, created_at FROM knowledge_nodes WHERE id = $1 AND organization_id = $2', [id, organizationId]);
        if (!res.rows[0])
            throw new common_1.NotFoundException('Node not found');
        return res.rows[0];
    }
    async createRelation(organizationId, dto) {
        const id = (0, uuid_1.v4)();
        await this.db.query(`INSERT INTO knowledge_relations (id, from_node_id, to_node_id, relation_type, strength, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (from_node_id, to_node_id, relation_type) DO UPDATE SET strength = EXCLUDED.strength`, [id, dto.fromNodeId, dto.toNodeId, dto.relationType, dto.strength ?? 1.0, organizationId]);
        return { id, ...dto };
    }
    async getGraph(organizationId, query) {
        let nodeIds = [];
        if (query.nodeId) {
            nodeIds = [query.nodeId];
            const depth = query.depth ?? 2;
            for (let d = 0; d < depth; d++) {
                const res = await this.db.query(`SELECT DISTINCT CASE WHEN from_node_id = ANY($1) THEN to_node_id ELSE from_node_id END as id
           FROM knowledge_relations
           WHERE (from_node_id = ANY($1) OR to_node_id = ANY($1)) AND organization_id = $2`, [nodeIds, organizationId]);
                const newIds = res.rows.map((r) => r.id);
                nodeIds = [...new Set([...nodeIds, ...newIds])];
            }
        }
        const nodeConditions = ['organization_id = $1'];
        const nodeValues = [organizationId];
        let idx = 2;
        if (nodeIds.length > 0) {
            nodeConditions.push(`id = ANY($${idx++})`);
            nodeValues.push(nodeIds);
        }
        if (query.nodeType) {
            nodeConditions.push(`type = $${idx++}`);
            nodeValues.push(query.nodeType);
        }
        if (query.search) {
            nodeConditions.push(`name ILIKE $${idx++}`);
            nodeValues.push(`%${query.search}%`);
        }
        const nodesRes = await this.db.query(`SELECT id, name, type, description, properties, created_at
       FROM knowledge_nodes WHERE ${nodeConditions.join(' AND ')} LIMIT 200`, nodeValues);
        const nodes = nodesRes.rows;
        if (nodes.length === 0)
            return { nodes: [], relations: [] };
        const allNodeIds = nodes.map((n) => n.id);
        const relationsRes = await this.db.query(`SELECT id, from_node_id, to_node_id, relation_type, strength
       FROM knowledge_relations
       WHERE from_node_id = ANY($1) AND to_node_id = ANY($1) AND organization_id = $2`, [allNodeIds, organizationId]);
        return { nodes, relations: relationsRes.rows };
    }
    async semanticSearch(organizationId, query) {
        const embedding = await this.aiService.createEmbedding(query);
        const res = await this.db.query(`SELECT id, name, type, description, properties,
              1 - (embedding <=> $2::vector) as score
       FROM knowledge_nodes
       WHERE organization_id = $1 AND embedding IS NOT NULL
       ORDER BY score DESC LIMIT 20`, [organizationId, `[${embedding.join(',')}]`]);
        return res.rows;
    }
    async syncFromDocuments(organizationId) {
        const docs = await this.db.query(`SELECT id, name, type, created_at, uploaded_by_id
       FROM documents WHERE organization_id = $1 AND status = 'indexed'`, [organizationId]);
        let created = 0;
        for (const doc of docs.rows) {
            const d = doc;
            const existing = await this.db.query(`SELECT id FROM knowledge_nodes WHERE source_type = 'document' AND source_id = $1`, [d.id]);
            if (existing.rows.length === 0) {
                await this.createNode(organizationId, {
                    name: d.name,
                    type: 'document',
                    description: `${d.type} document`,
                    sourceType: 'document',
                    sourceId: d.id,
                });
                created++;
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