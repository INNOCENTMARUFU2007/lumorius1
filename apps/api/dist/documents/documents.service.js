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
        await this.db.query(`INSERT INTO documents (
         id, name, type, status, size_bytes, storage_key,
         organization_id, uploaded_by_id, team_id, tags
       )
       VALUES ($1, $2, $3, 'uploading', $4, $5, $6, $7, $8, $9)`, [
            docId,
            file.originalname,
            docType,
            file.size,
            storageKey,
            organizationId,
            userId,
            opts.teamId ?? null,
            `{${(opts.tags ?? []).join(',')}}`,
        ]);
        await this.db.query(`UPDATE organizations
       SET storage_used_bytes = storage_used_bytes + $1
       WHERE id = $2`, [file.size, organizationId]);
        await this.documentsQueue.add('process', {
            documentId: docId,
            organizationId,
        }, {
            priority: 1,
        });
        return this.findById(docId, organizationId);
    }
    async findAll(organizationId, query) {
        const requestedPage = Number(query.page ?? 1);
        const requestedPageSize = Number(query.pageSize ?? 20);
        const page = Number.isSafeInteger(requestedPage) &&
            requestedPage > 0
            ? Math.min(requestedPage, 1_000_000)
            : 1;
        const pageSize = Number.isSafeInteger(requestedPageSize) &&
            requestedPageSize > 0
            ? Math.min(requestedPageSize, 100)
            : 20;
        const offset = (page - 1) * pageSize;
        const conditions = [
            'd.organization_id = $1',
        ];
        const values = [organizationId];
        if (query.search?.trim()) {
            values.push(`%${query.search.trim()}%`);
            conditions.push(`d.name ILIKE $${values.length}`);
        }
        if (query.status?.trim()) {
            values.push(query.status.trim());
            conditions.push(`d.status = $${values.length}`);
        }
        if (query.type?.trim()) {
            values.push(query.type.trim());
            conditions.push(`d.type = $${values.length}`);
        }
        if (query.teamId?.trim()) {
            values.push(query.teamId.trim());
            conditions.push(`d.team_id = $${values.length}`);
        }
        const where = conditions.join(' AND ');
        const limitPlaceholder = values.length + 1;
        const offsetPlaceholder = values.length + 2;
        const dataValues = [
            ...values,
            pageSize,
            offset,
        ];
        const [countResult, dataResult] = await Promise.all([
            this.db.query(`SELECT COUNT(*) AS count
         FROM documents d
         WHERE ${where}`, values),
            this.db.query(`SELECT
           d.*,
           u.name AS uploaded_by_name
         FROM documents d
         LEFT JOIN users u
           ON d.uploaded_by_id = u.id
         WHERE ${where}
         ORDER BY d.created_at DESC
         LIMIT $${limitPlaceholder}
         OFFSET $${offsetPlaceholder}`, dataValues),
        ]);
        const total = Number(countResult.rows[0]?.count ?? 0);
        return {
            data: dataResult.rows,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }
    async getSearchFacets(organizationId) {
        const [types, tags, total] = await Promise.all([
            this.db.query(`SELECT type, COUNT(*)::int AS count
         FROM documents
         WHERE organization_id = $1
           AND status = 'indexed'
         GROUP BY type
         ORDER BY type`, [organizationId]),
            this.db.query(`SELECT
           tags.tag,
           COUNT(DISTINCT d.id)::int AS count
         FROM documents d
         CROSS JOIN LATERAL unnest(d.tags) AS tags(tag)
         WHERE d.organization_id = $1
           AND d.status = 'indexed'
         GROUP BY tags.tag
         ORDER BY tags.tag`, [organizationId]),
            this.db.query(`SELECT COUNT(*) AS count
         FROM documents
         WHERE organization_id = $1
           AND status = 'indexed'`, [organizationId]),
        ]);
        return {
            types: types.rows,
            tags: tags.rows,
            total: Number(total.rows[0]?.count ?? 0),
        };
    }
    async findById(docId, organizationId) {
        const result = await this.db.query(`SELECT
         d.*,
         u.name AS uploaded_by_name
       FROM documents d
       LEFT JOIN users u
         ON d.uploaded_by_id = u.id
       WHERE d.id = $1
         AND d.organization_id = $2`, [docId, organizationId]);
        if (!result.rows[0]) {
            throw new common_1.NotFoundException('Document not found');
        }
        return result.rows[0];
    }
    async delete(docId, organizationId) {
        const doc = await this.findById(docId, organizationId);
        await this.storage.delete(doc.storage_key);
        await this.db.query(`UPDATE organizations
       SET storage_used_bytes = GREATEST(
         0,
         storage_used_bytes - $1
       )
       WHERE id = $2`, [doc.size_bytes, organizationId]);
        await this.db.query(`DELETE FROM documents
       WHERE id = $1
         AND organization_id = $2`, [docId, organizationId]);
        return { deleted: true };
    }
    async search(organizationId, query, opts = {}) {
        if (!query.trim()) {
            throw new common_1.BadRequestException('query must not be empty');
        }
        const requestedTopK = Number(opts.topK ?? 5);
        const topK = Number.isSafeInteger(requestedTopK) &&
            requestedTopK > 0
            ? Math.min(50, requestedTopK)
            : 5;
        const createdAfter = opts.createdAfter
            ? new Date(opts.createdAfter)
            : null;
        if (createdAfter &&
            !Number.isFinite(createdAfter.getTime())) {
            throw new common_1.BadRequestException('createdAfter must be a valid date');
        }
        const embedding = await this.aiService.createEmbedding(query);
        let sql = `
      SELECT
        dc.id AS chunk_id,
        dc.content,
        dc.document_id,
        d.name AS document_name,
        d.type,
        d.tags,
        d.created_at,
        d.team_id,
        1 - (dc.embedding <=> $2::vector) AS score
      FROM document_chunks dc
      JOIN documents d
        ON dc.document_id = d.id
      WHERE d.organization_id = $1
        AND d.status = 'indexed'
        AND dc.embedding IS NOT NULL
    `;
        const values = [
            organizationId,
            `[${embedding.join(',')}]`,
        ];
        let parameterIndex = 3;
        if (opts.documentIds &&
            opts.documentIds.length > 0) {
            sql +=
                ` AND dc.document_id = ANY($${parameterIndex++}::uuid[])`;
            values.push(opts.documentIds.slice(0, 100));
        }
        if (opts.type) {
            sql += ` AND d.type = $${parameterIndex++}`;
            values.push(opts.type);
        }
        if (opts.tag) {
            sql += ` AND $${parameterIndex++} = ANY(d.tags)`;
            values.push(opts.tag);
        }
        if (createdAfter) {
            sql += ` AND d.created_at >= $${parameterIndex++}`;
            values.push(createdAfter);
        }
        if (opts.teamId) {
            sql += ` AND d.team_id = $${parameterIndex++}`;
            values.push(opts.teamId);
        }
        if (opts.uploadedById) {
            sql +=
                ` AND d.uploaded_by_id = $${parameterIndex++}`;
            values.push(opts.uploadedById);
        }
        sql += ` ORDER BY score DESC LIMIT ${topK}`;
        const result = await this.db.query(sql, values);
        return result.rows;
    }
    async ask(organizationId, question, opts) {
        if (!question.trim()) {
            throw new common_1.BadRequestException('question must not be empty');
        }
        const chunks = await this.search(organizationId, question, {
            documentIds: opts.documentIds,
            topK: 8,
            type: opts.type,
            tag: opts.tag,
            createdAfter: opts.createdAfter,
            teamId: opts.teamId,
            uploadedById: opts.uploadedById,
        });
        if (chunks.length === 0) {
            return {
                answer: "I couldn't find relevant information in your documents. Please upload more documents or refine your question.",
                sources: [],
                confidence: 0,
            };
        }
        const context = chunks
            .map((chunk, index) => `[Source ${index + 1}: ${chunk.document_name}]\n${chunk.content}`)
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
            sources: chunks.map((chunk) => ({
                chunkId: chunk.chunk_id,
                documentId: chunk.document_id,
                documentName: chunk.document_name,
                content: String(chunk.content ?? '').substring(0, 300),
                score: chunk.score,
                type: chunk.type,
                tags: chunk.tags,
                createdAt: chunk.created_at,
                teamId: chunk.team_id,
            })),
            confidence: chunks[0]?.score ?? 0,
        };
    }
    async getDownloadUrl(docId, organizationId) {
        const doc = await this.findById(docId, organizationId);
        const url = await this.storage.getPresignedUrl(doc.storage_key);
        return {
            url,
            expiresIn: 3600,
        };
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