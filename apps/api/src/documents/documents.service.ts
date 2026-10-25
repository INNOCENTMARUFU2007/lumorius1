
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { AiService } from '../ai/ai.service';

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    'xlsx',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
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
      throw new BadRequestException(
        `Unsupported file type: ${mimeType}`,
      );
    }

    const docId = uuidv4();
    const storageKey =
      `orgs/${organizationId}/documents/${docId}/${file.originalname}`;

    await this.storage.upload(
      storageKey,
      file.buffer,
      file.mimetype,
    );

    await this.db.query(
      `INSERT INTO documents (
         id, name, type, status, size_bytes, storage_key,
         organization_id, uploaded_by_id, team_id, tags
       )
       VALUES ($1, $2, $3, 'uploading', $4, $5, $6, $7, $8, $9)`,
      [
        docId,
        file.originalname,
        docType,
        file.size,
        storageKey,
        organizationId,
        userId,
        opts.teamId ?? null,
        `{${(opts.tags ?? []).join(',')}}`,
      ],
    );

    // Update organisation storage usage.
    await this.db.query(
      `UPDATE organizations
       SET storage_used_bytes = storage_used_bytes + $1
       WHERE id = $2`,
      [file.size, organizationId],
    );

    // Queue document processing.
    await this.documentsQueue.add(
      'process',
      {
        documentId: docId,
        organizationId,
      },
      {
        priority: 1,
      },
    );

    return this.findById(docId, organizationId);
  }

  /**
   * List documents with validated pagination and optional filters.
   *
   * Invalid or missing pagination values safely fall back to
   * page 1 and a page size of 20.
   */
  async findAll(
    organizationId: string,
    query: {
      search?: string;
      status?: string;
      type?: string;
      teamId?: string;
      page?: number | string;
      pageSize?: number | string;
    },
  ) {
    const requestedPage = Number(query.page ?? 1);
    const requestedPageSize = Number(query.pageSize ?? 20);

    const page =
      Number.isSafeInteger(requestedPage) &&
      requestedPage > 0
        ? Math.min(requestedPage, 1_000_000)
        : 1;

    const pageSize =
      Number.isSafeInteger(requestedPageSize) &&
      requestedPageSize > 0
        ? Math.min(requestedPageSize, 100)
        : 20;

    const offset = (page - 1) * pageSize;

    const conditions: string[] = [
      'd.organization_id = $1',
    ];

    const values: unknown[] = [organizationId];

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

    // Add LIMIT and OFFSET as SQL parameters, not interpolated text.
    const limitPlaceholder = values.length + 1;
    const offsetPlaceholder = values.length + 2;

    const dataValues: unknown[] = [
      ...values,
      pageSize,
      offset,
    ];

    const [countResult, dataResult] = await Promise.all([
      this.db.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM documents d
         WHERE ${where}`,
        values,
      ),

      this.db.query(
        `SELECT
           d.*,
           u.name AS uploaded_by_name
         FROM documents d
         LEFT JOIN users u
           ON d.uploaded_by_id = u.id
         WHERE ${where}
         ORDER BY d.created_at DESC
         LIMIT $${limitPlaceholder}
         OFFSET $${offsetPlaceholder}`,
        dataValues,
      ),
    ]);

    const total = Number(
      countResult.rows[0]?.count ?? 0,
    );

    return {
      data: dataResult.rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getSearchFacets(organizationId: string) {
    const [types, tags, total] = await Promise.all([
      this.db.query(
        `SELECT type, COUNT(*)::int AS count
         FROM documents
         WHERE organization_id = $1
           AND status = 'indexed'
         GROUP BY type
         ORDER BY type`,
        [organizationId],
      ),

      this.db.query(
        `SELECT
           tags.tag,
           COUNT(DISTINCT d.id)::int AS count
         FROM documents d
         CROSS JOIN LATERAL unnest(d.tags) AS tags(tag)
         WHERE d.organization_id = $1
           AND d.status = 'indexed'
         GROUP BY tags.tag
         ORDER BY tags.tag`,
        [organizationId],
      ),

      this.db.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM documents
         WHERE organization_id = $1
           AND status = 'indexed'`,
        [organizationId],
      ),
    ]);

    return {
      types: types.rows,
      tags: tags.rows,
      total: Number(total.rows[0]?.count ?? 0),
    };
  }

  async findById(
    docId: string,
    organizationId: string,
  ) {
    const result = await this.db.query(
      `SELECT
         d.*,
         u.name AS uploaded_by_name
       FROM documents d
       LEFT JOIN users u
         ON d.uploaded_by_id = u.id
       WHERE d.id = $1
         AND d.organization_id = $2`,
      [docId, organizationId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Document not found');
    }

    return result.rows[0];
  }

  async delete(
    docId: string,
    organizationId: string,
  ) {
    const doc = await this.findById(
      docId,
      organizationId,
    );

    await this.storage.delete(
      doc.storage_key as string,
    );

    await this.db.query(
      `UPDATE organizations
       SET storage_used_bytes = GREATEST(
         0,
         storage_used_bytes - $1
       )
       WHERE id = $2`,
      [doc.size_bytes, organizationId],
    );

    await this.db.query(
      `DELETE FROM documents
       WHERE id = $1
         AND organization_id = $2`,
      [docId, organizationId],
    );

    return { deleted: true };
  }

  async search(
    organizationId: string,
    query: string,
    opts: {
      documentIds?: string[];
      topK?: number;
      type?: string;
      tag?: string;
      createdAfter?: string;
      teamId?: string;
      uploadedById?: string;
    } = {},
  ) {
    if (!query.trim()) {
      throw new BadRequestException(
        'query must not be empty',
      );
    }

    const requestedTopK = Number(opts.topK ?? 5);

    const topK =
      Number.isSafeInteger(requestedTopK) &&
      requestedTopK > 0
        ? Math.min(50, requestedTopK)
        : 5;

    const createdAfter = opts.createdAfter
      ? new Date(opts.createdAfter)
      : null;

    if (
      createdAfter &&
      !Number.isFinite(createdAfter.getTime())
    ) {
      throw new BadRequestException(
        'createdAfter must be a valid date',
      );
    }

    const embedding =
      await this.aiService.createEmbedding(query);

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

    const values: unknown[] = [
      organizationId,
      `[${embedding.join(',')}]`,
    ];

    let parameterIndex = 3;

    if (
      opts.documentIds &&
      opts.documentIds.length > 0
    ) {
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

    // topK has already been validated and capped.
    sql += ` ORDER BY score DESC LIMIT ${topK}`;

    const result = await this.db.query(sql, values);

    return result.rows;
  }

  async ask(
    organizationId: string,
    question: string,
    opts: {
      documentIds?: string[];
      teamId?: string;
      type?: string;
      tag?: string;
      createdAfter?: string;
      uploadedById?: string;
    },
  ) {
    if (!question.trim()) {
      throw new BadRequestException(
        'question must not be empty',
      );
    }

    const chunks = await this.search(
      organizationId,
      question,
      {
        documentIds: opts.documentIds,
        topK: 8,
        type: opts.type,
        tag: opts.tag,
        createdAfter: opts.createdAfter,
        teamId: opts.teamId,
        uploadedById: opts.uploadedById,
      },
    );

    if (chunks.length === 0) {
      return {
        answer:
          "I couldn't find relevant information in your documents. Please upload more documents or refine your question.",
        sources: [],
        confidence: 0,
      };
    }

    const context = chunks
      .map(
        (chunk, index) =>
          `[Source ${index + 1}: ${chunk.document_name}]\n${chunk.content}`,
      )
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
        content:
          `Context:\n${context}\n\nQuestion: ${question}`,
      },
    ]);

    return {
      answer,
      sources: chunks.map((chunk) => ({
        chunkId: chunk.chunk_id,
        documentId: chunk.document_id,
        documentName: chunk.document_name,
        content: String(chunk.content ?? '').substring(
          0,
          300,
        ),
        score: chunk.score,
        type: chunk.type,
        tags: chunk.tags,
        createdAt: chunk.created_at,
        teamId: chunk.team_id,
      })),
      confidence: chunks[0]?.score ?? 0,
    };
  }

  async getDownloadUrl(
    docId: string,
    organizationId: string,
  ) {
    const doc = await this.findById(
      docId,
      organizationId,
    );

    const url = await this.storage.getPresignedUrl(
      doc.storage_key as string,
    );

    return {
      url,
      expiresIn: 3600,
    };
  }
}
