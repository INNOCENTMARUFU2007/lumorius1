import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { AiService } from '../ai/ai.service';

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/markdown': 'md',
};

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly aiService: AiService,
    @InjectQueue('documents') private readonly documentsQueue: Queue,
  ) {}

  async upload(
    file: Express.Multer.File,
    organizationId: string,
    userId: string,
    opts: { teamId?: string; tags?: string[] },
  ) {
    const mimeType = file.mimetype;
    const docType = ALLOWED_TYPES[mimeType];
    if (!docType) {
      throw new BadRequestException(`Unsupported file type: ${mimeType}`);
    }

    const docId = uuidv4();
    const storageKey = `orgs/${organizationId}/documents/${docId}/${file.originalname}`;

    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    await this.db.query(
      `INSERT INTO documents (id, name, type, status, size_bytes, storage_key,
        organization_id, uploaded_by_id, team_id, tags)
       VALUES ($1, $2, $3, 'uploading', $4, $5, $6, $7, $8, $9)`,
      [
        docId, file.originalname, docType, file.size, storageKey,
        organizationId, userId, opts.teamId ?? null,
        `{${(opts.tags ?? []).join(',')}}`,
      ],
    );

    // Update org storage usage
    await this.db.query(
      'UPDATE organizations SET storage_used_bytes = storage_used_bytes + $1 WHERE id = $2',
      [file.size, organizationId],
    );

    // Queue for processing
    await this.documentsQueue.add('process', { documentId: docId, organizationId }, {
      priority: 1,
    });

    return this.findById(docId, organizationId);
  }

  async findAll(organizationId: string, query: {
    search?: string; status?: string; type?: string;
    teamId?: string; page?: number; pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['d.organization_id = $1'];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (query.search) {
      conditions.push(`d.name ILIKE $${idx++}`);
      values.push(`%${query.search}%`);
    }
    if (query.status) { conditions.push(`d.status = $${idx++}`); values.push(query.status); }
    if (query.type) { conditions.push(`d.type = $${idx++}`); values.push(query.type); }
    if (query.teamId) { conditions.push(`d.team_id = $${idx++}`); values.push(query.teamId); }

    const where = conditions.join(' AND ');

    const [countResult, dataResult] = await Promise.all([
      this.db.query<{ count: string }>(`SELECT COUNT(*) FROM documents d WHERE ${where}`, values),
      this.db.query(
        `SELECT d.*, u.name as uploaded_by_name
         FROM documents d
         LEFT JOIN users u ON d.uploaded_by_id = u.id
         WHERE ${where}
         ORDER BY d.created_at DESC
         LIMIT ${pageSize} OFFSET ${offset}`,
        values,
      ),
    ]);

    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0]?.count ?? '0', 10),
      page,
      pageSize,
      totalPages: Math.ceil(parseInt(countResult.rows[0]?.count ?? '0', 10) / pageSize),
    };
  }

  async findById(docId: string, organizationId: string) {
    const result = await this.db.query(
      `SELECT d.*, u.name as uploaded_by_name
       FROM documents d
       LEFT JOIN users u ON d.uploaded_by_id = u.id
       WHERE d.id = $1 AND d.organization_id = $2`,
      [docId, organizationId],
    );
    if (!result.rows[0]) throw new NotFoundException('Document not found');
    return result.rows[0];
  }

  async delete(docId: string, organizationId: string) {
    const doc = await this.findById(docId, organizationId);
    await this.storage.delete(doc.storage_key as string);
    await this.db.query(
      'UPDATE organizations SET storage_used_bytes = GREATEST(0, storage_used_bytes - $1) WHERE id = $2',
      [doc.size_bytes, organizationId],
    );
    await this.db.query(
      'DELETE FROM documents WHERE id = $1 AND organization_id = $2',
      [docId, organizationId],
    );
    return { deleted: true };
  }

  async search(organizationId: string, query: string, opts: { documentIds?: string[]; topK?: number }) {
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
    const values: unknown[] = [organizationId, `[${embedding.join(',')}]`];

    if (opts.documentIds && opts.documentIds.length > 0) {
      sql += ` AND dc.document_id = ANY($3)`;
      values.push(opts.documentIds);
    }

    sql += ` ORDER BY score DESC LIMIT ${topK}`;

    const result = await this.db.query(sql, values);
    return result.rows;
  }

  async ask(organizationId: string, question: string, opts: { documentIds?: string[]; teamId?: string }) {
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
        content: (c.content as string).substring(0, 300),
        score: c.score,
      })),
      confidence: chunks[0]?.score ?? 0,
    };
  }

  async getDownloadUrl(docId: string, organizationId: string) {
    const doc = await this.findById(docId, organizationId);
    const url = await this.storage.getPresignedUrl(doc.storage_key as string);
    return { url, expiresIn: 3600 };
  }
}
