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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DocumentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const uuid_1 = require("uuid");
const database_service_1 = require("../database/database.service");
const storage_service_1 = require("../storage/storage.service");
const ai_service_1 = require("../ai/ai.service");
const ALLOWED_TYPES = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/csv': 'csv',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/markdown': 'md',
};
let DocumentsService = DocumentsService_1 = class DocumentsService {
    constructor(db, storage, aiService, documentsQueue) {
        this.db = db;
        this.storage = storage;
        this.aiService = aiService;
        this.documentsQueue = documentsQueue;
        this.logger = new common_1.Logger(DocumentsService_1.name);
    }
    async upload(file, organizationId, userId, opts) {
        const mimeType = file.mimetype;
        const docType = ALLOWED_TYPES[mimeType];
        if (!docType) {
            throw new common_1.BadRequestException(`Unsupported file type: ${mimeType}`);
        }
        const docId = (0, uuid_1.v4)();
        const storageKey = `orgs/${organizationId}/documents/${docId}/${file.originalname}`;
        await this.storage.upload(storageKey, file.buffer, file.mimetype);
        await this.db.query(`INSERT INTO documents (id, name, type, status, size_bytes, storage_key,
        organization_id, uploaded_by_id, team_id, tags)
       VALUES ($1, $2, $3, 'uploading', $4, $5, $6, $7, $8, $9)`, [
            docId, file.originalname, docType, file.size, storageKey,
            organizationId, userId, opts.teamId ?? null,
            `{${(opts.tags ?? []).join(',')}}`,
        ]);
        await this.db.query('UPDATE organizations SET storage_used_bytes = storage_used_bytes + $1 WHERE id = $2', [file.size, organizationId]);
        await this.documentsQueue.add('process', { documentId: docId, organizationId }, {
            priority: 1,
        });
        return this.findById(docId, organizationId);
    }
    async findAll(organizationId, query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const offset = (page - 1) * pageSize;
        const conditions = ['d.organization_id = $1'];
        const values = [organizationId];
        let idx = 2;
        if (query.search) {
            conditions.push(`d.name ILIKE $${idx++}`);
            values.push(`%${query.search}%`);
        }
        if (query.status) {
            conditions.push(`d.status = $${idx++}`);
            values.push(query.status);
        }
        if (query.type) {
            conditions.push(`d.type = $${idx++}`);
            values.push(query.type);
        }
        if (query.teamId) {
            conditions.push(`d.team_id = $${idx++}`);
            values.push(query.teamId);
        }
        const where = conditions.join(' AND ');
        const [countResult, dataResult] = await Promise.all([
            this.db.query(`SELECT COUNT(*) FROM documents d WHERE ${where}`, values),
            this.db.query(`SELECT d.*, u.name as uploaded_by_name
         FROM documents d
         LEFT JOIN users u ON d.uploaded_by_id = u.id
         WHERE ${where}
         ORDER BY d.created_at DESC
         LIMIT ${pageSize} OFFSET ${offset}`, values),
        ]);
        return {
            data: dataResult.rows,
            total: parseInt(countResult.rows[0]?.count ?? '0', 10),
            page,
            pageSize,
            totalPages: Math.ceil(parseInt(countResult.rows[0]?.count ?? '0', 10) / pageSize),
        };
    }
    async findById(docId, organizationId) {
        const result = await this.db.query(`SELECT d.*, u.name as uploaded_by_name
       FROM documents d
       LEFT JOIN users u ON d.uploaded_by_id = u.id
       WHERE d.id = $1 AND d.organization_id = $2`, [docId, organizationId]);
        if (!result.rows[0])
            throw new common_1.NotFoundException('Document not found');
        return result.rows[0];
    }
    async delete(docId, organizationId) {
        const doc = await this.findById(docId, organizationId);
        await this.storage.delete(doc.storage_key);
        await this.db.query('UPDATE organizations SET storage_used_bytes = GREATEST(0, storage_used_bytes - $1) WHERE id = $2', [doc.size_bytes, organizationId]);
        await this.db.query('DELETE FROM documents WHERE id = $1 AND organization_id = $2', [docId, organizationId]);
        return { deleted: true };
    }
    async search(organizationId, query, opts) {
        const topK = opts.topK ?? 5;
        const embedding = await this.aiService.createEmbedding(query);
        let sql = `
      SELECT dc.id as chunk_id, dc.content, dc.document_id,
             d.name as document_name,
             1 - (dc.embedding <=> $2::vector) as score
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.organization_id = $1
        AND dc.embedding IS NOT NULL
    `;
        const values = [organizationId, `[${embedding.join(',')}]`];
        if (opts.documentIds && opts.documentIds.length > 0) {
            sql += ` AND dc.document_id = ANY($3)`;
            values.push(opts.documentIds);
        }
        sql += ` ORDER BY score DESC LIMIT ${topK}`;
        const result = await this.db.query(sql, values);
        return result.rows;
    }
    async ask(organizationId, question, opts) {
        const chunks = await this.search(organizationId, question, {
            documentIds: opts.documentIds,
            topK: 8,
        });
        if (chunks.length === 0) {
            return {
                answer: "I couldn't find relevant information in your documents. Please upload more documents or refine your question.",
                sources: [],
                confidence: 0,
            };
        }
        const context = chunks
            .map((c, i) => `[Source ${i + 1}: ${c.document_name}]\n${c.content}`)
            .join('\n\n---\n\n');
        const answer = await this.aiService.chat([
            {
                role: 'system',
                content: `You are a helpful AI assistant with access to company documents. 
Answer questions based solely on the provided context. 
If the context doesn't contain enough information, say so clearly.
Always cite your sources using [Source N] references.`,
            },
            {
                role: 'user',
                content: `Context:\n${context}\n\nQuestion: ${question}`,
            },
        ]);
        return {
            answer,
            sources: chunks.map((c) => ({
                chunkId: c.chunk_id,
                documentId: c.document_id,
                documentName: c.document_name,
                content: c.content.substring(0, 300),
                score: c.score,
            })),
            confidence: chunks[0]?.score ?? 0,
        };
    }
    async getDownloadUrl(docId, organizationId) {
        const doc = await this.findById(docId, organizationId);
        const url = await this.storage.getPresignedUrl(doc.storage_key);
        return { url, expiresIn: 3600 };
    }
};
exports.DocumentsService = DocumentsService;
exports.DocumentsService = DocumentsService = DocumentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, bull_1.InjectQueue)('documents')),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        storage_service_1.StorageService,
        ai_service_1.AiService, Object])
], DocumentsService);
//# sourceMappingURL=documents.service.js.map