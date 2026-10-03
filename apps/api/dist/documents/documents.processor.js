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
var DocumentsProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const uuid_1 = require("uuid");
const database_service_1 = require("../database/database.service");
const storage_service_1 = require("../storage/storage.service");
const embedding_service_1 = require("./embedding.service");
const ai_service_1 = require("../ai/ai.service");
let DocumentsProcessor = DocumentsProcessor_1 = class DocumentsProcessor {
    constructor(db, storage, embeddingService, aiService, eventEmitter) {
        this.db = db;
        this.storage = storage;
        this.embeddingService = embeddingService;
        this.aiService = aiService;
        this.eventEmitter = eventEmitter;
        this.logger = new common_1.Logger(DocumentsProcessor_1.name);
    }
    async processDocument(job) {
        const { documentId, organizationId } = job.data;
        this.logger.log(`Processing document ${documentId}`);
        try {
            await this.db.query("UPDATE documents SET status = 'processing' WHERE id = $1", [documentId]);
            const doc = await this.db.findOne('documents', { id: documentId });
            if (!doc)
                throw new Error('Document not found');
            const buffer = await this.storage.download(doc.storage_key);
            const text = await this.embeddingService.extractText(buffer, doc.type, doc.name);
            const chunks = this.embeddingService.chunkText(text, 1000, 200);
            this.logger.log(`Split document into ${chunks.length} chunks`);
            const batchSize = 20;
            for (let i = 0; i < chunks.length; i += batchSize) {
                const batch = chunks.slice(i, i + batchSize);
                const embeddings = await this.aiService.createEmbeddings(batch.map((c) => c.text));
                for (let j = 0; j < batch.length; j++) {
                    const chunk = batch[j];
                    const embedding = embeddings[j];
                    await this.db.query(`INSERT INTO document_chunks (id, document_id, content, chunk_index, token_count, embedding)
             VALUES ($1, $2, $3, $4, $5, $6::vector)`, [
                        (0, uuid_1.v4)(), documentId, chunk.text, i + j,
                        chunk.tokenCount, `[${embedding.join(',')}]`,
                    ]);
                }
                await job.progress(Math.round(((i + batchSize) / chunks.length) * 90));
            }
            await this.db.query(`UPDATE documents SET status = 'indexed', chunk_count = $1, updated_at = NOW() WHERE id = $2`, [chunks.length, documentId]);
            await job.progress(100);
            this.logger.log(`Document ${documentId} indexed successfully`);
            this.eventEmitter.emit('document.indexed', {
                documentId,
                documentName: doc.name,
                uploadedById: doc.uploaded_by_id,
                organizationId,
                chunkCount: chunks.length,
            });
        }
        catch (error) {
            this.logger.error(`Failed to process document ${documentId}`, error);
            await this.db.query(`UPDATE documents SET status = 'failed', error_message = $1 WHERE id = $2`, [String(error), documentId]);
            const doc = await this.db.findOne('documents', { id: documentId });
            if (doc) {
                this.eventEmitter.emit('document.failed', {
                    documentId,
                    documentName: doc.name,
                    uploadedById: doc.uploaded_by_id,
                    organizationId,
                    errorMessage: String(error),
                });
            }
            throw error;
        }
    }
};
exports.DocumentsProcessor = DocumentsProcessor;
__decorate([
    (0, bull_1.Process)('process'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DocumentsProcessor.prototype, "processDocument", null);
exports.DocumentsProcessor = DocumentsProcessor = DocumentsProcessor_1 = __decorate([
    (0, bull_1.Processor)('documents'),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        storage_service_1.StorageService,
        embedding_service_1.EmbeddingService,
        ai_service_1.AiService,
        event_emitter_1.EventEmitter2])
], DocumentsProcessor);
//# sourceMappingURL=documents.processor.js.map