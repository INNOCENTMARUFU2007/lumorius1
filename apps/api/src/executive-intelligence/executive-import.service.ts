import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import type { PoolClient } from 'pg';
import { LuieEventPublisher } from '../luie/luie-event.publisher';

export type ExecutiveDatasetType = 'transactions' | 'contracts' | 'pipeline';

export interface ExecutiveImportActor {
  organizationId: string;
  userId: string;
  role: string;
}

interface ParsedImportFile {
  headers: string[];
  rows: Array<{ rowNumber: number; rawData: Record<string, unknown> }>;
}

export interface ImportRowRecord {
  id: string;
  row_number: number;
  raw_data: Record<string, unknown>;
  normalized_data: Record<string, unknown> | null;
  validation_status: string;
  validation_errors: unknown[];
  fingerprint: string | null;
}

interface ImportRecord {
  id: string;
  organization_id: string;
  created_by_id: string;
  dataset_type: ExecutiveDatasetType;
  status: string;
  file_name: string;
  source_headers: string[];
  column_mapping: Record<string, string>;
  row_count: number;
  valid_row_count: number;
  invalid_row_count: number;
  duplicate_row_count: number;
  validation_summary: Record<string, unknown>;
  committed_at: Date | string | null;
}

interface FinancialCandidateRow {
  id: string;
  organization_id: string;
  document_id: string;
  source_chunk_id: string | null;
  team_id: string | null;
  transaction_date: Date | string;
  transaction_type: string;
  amount: string | number;
  currency: string;
  description: string;
  evidence_excerpt: string;
  confidence: string | number;
  status: string;
  source_import_id: string | null;
  target_record_id: string | null;
}

interface FinancialCandidateSourceChunk {
  chunkId: string;
  content: string;
}

interface NormalizedRow {
  normalized: Record<string, unknown> | null;
  fingerprint: string | null;
  duplicateKey: string | null;
  errors: string[];
}

const DATASET_FIELDS: Record<ExecutiveDatasetType, { required: string[]; optional: string[] }> = {
  transactions: {
    required: ['transaction_date', 'transaction_type', 'amount', 'currency'],
    optional: ['customer_key', 'external_reference', 'description'],
  },
  contracts: {
    required: ['external_contract_id', 'customer_key', 'status', 'recurring_amount', 'currency', 'billing_interval', 'start_date'],
    optional: ['end_date', 'cancelled_at'],
  },
  pipeline: {
    required: ['external_opportunity_id', 'title', 'stage', 'status', 'amount', 'currency', 'probability'],
    optional: ['customer_key', 'expected_close_date', 'closed_at'],
  },
};

const TRANSACTION_TYPES = [
  'revenue', 'refund', 'acquisition_cost', 'cost_of_goods_sold',
  'operating_expense', 'other_income', 'tax', 'capital_expenditure',
] as const;
const CONTRACT_STATUSES = ['trialing', 'active', 'paused', 'cancelled', 'expired'] as const;
const BILLING_INTERVALS = ['weekly', 'monthly', 'quarterly', 'annual'] as const;
const PIPELINE_STATUSES = ['open', 'won', 'lost'] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ExecutiveImportService {
  private readonly maxFileBytes = 10 * 1024 * 1024;
  private readonly maxRows = 10_000;
  private readonly maxColumns = 100;
  private readonly previewLimit = 100;

  constructor(
    private readonly db: DatabaseService,
    private readonly luiePublisher: LuieEventPublisher,
  ) {}

  async upload(
    file: Express.Multer.File,
    datasetTypeInput: unknown,
    actor: ExecutiveImportActor,
  ) {
    this.assertAdmin(actor);
    const datasetType = this.parseDatasetType(datasetTypeInput);
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException('A non-empty CSV or XLSX file is required.');
    }
    if (file.buffer.length > this.maxFileBytes) {
      throw new BadRequestException('Executive Intelligence imports are limited to 10 MB.');
    }

    const originalName = typeof file.originalname === 'string' ? file.originalname : 'import';
    const extension = path.extname(originalName).toLowerCase();
    if (!['.csv', '.xlsx'].includes(extension)) {
      throw new BadRequestException('Only .csv and .xlsx files are supported. Legacy .xls files are not accepted.');
    }
    if (extension === '.xlsx' && !(file.buffer[0] === 0x50 && file.buffer[1] === 0x4b)) {
      throw new BadRequestException('The uploaded XLSX file does not have a valid ZIP container signature.');
    }
    if (extension === '.csv' && file.buffer.includes(0)) {
      throw new BadRequestException('The uploaded CSV contains binary or null-byte content.');
    }

    const parsed = this.parseWorkbook(file.buffer);
    const importId = uuidv4();
    const fileSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const fileName = path.basename(originalName).replace(/[\u0000-\u001f]/g, '_').slice(0, 255) || 'import';

    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO executive_imports
          (id, organization_id, created_by_id, dataset_type, status, file_name,
           file_sha256, source_headers, column_mapping, row_count,
           valid_row_count, invalid_row_count, duplicate_row_count,
           validation_version, validation_summary)
         VALUES ($1, $2, $3, $4, 'mapping_required', $5, $6, $7::jsonb,
                 '{}'::jsonb, $8, 0, 0, 0, 1, '{}'::jsonb)`,
        [importId, actor.organizationId, actor.userId, datasetType, fileName,
          fileSha256, JSON.stringify(parsed.headers), parsed.rows.length],
      );

      await client.query(
        `INSERT INTO executive_import_rows
          (organization_id, import_id, row_number, raw_data,
           validation_status, validation_errors)
         SELECT $1, $2, (item->>'rowNumber')::integer, item->'rawData',
                'pending', '[]'::jsonb
         FROM jsonb_array_elements($3::jsonb) AS entries(item)`,
        [actor.organizationId, importId, JSON.stringify(parsed.rows.map((row) => ({
          rowNumber: row.rowNumber, rawData: row.rawData,
        })))],
      );

      await client.query(
        `INSERT INTO executive_audit_events
          (organization_id, actor_id, event_type, entity_type, entity_id, details)
         VALUES ($1, $2, 'import_uploaded', 'import', $3, $4::jsonb)`,
        [actor.organizationId, actor.userId, importId, JSON.stringify({
          datasetType, fileName, fileSha256, rowCount: parsed.rows.length,
          headerCount: parsed.headers.length,
        })],
      );
    });

    return {
      id: importId,
      datasetType,
      status: 'mapping_required',
      fileName,
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      preview: parsed.rows.slice(0, 10).map((row) => ({ rowNumber: row.rowNumber, data: row.rawData })),
      supportedFields: DATASET_FIELDS[datasetType],
      message: 'Import staged. Map source columns and validate before committing any records.',
    };
  }

  async listImports(actor: ExecutiveImportActor, pageInput?: unknown, pageSizeInput?: unknown) {
    this.assertAdmin(actor);
    const page = this.positiveInteger(pageInput, 1, 1_000_000);
    const pageSize = this.positiveInteger(pageSizeInput, 20, 100);
    const offset = (page - 1) * pageSize;
    const [count, rows] = await Promise.all([
      this.db.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM executive_imports WHERE organization_id = $1',
        [actor.organizationId],
      ),
      this.db.query(
        `SELECT id, dataset_type, status, file_name, row_count, valid_row_count,
                invalid_row_count, duplicate_row_count, validation_summary,
                committed_at, created_at, updated_at
         FROM executive_imports
         WHERE organization_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [actor.organizationId, pageSize, offset],
      ),
    ]);
    const total = Number(count.rows[0]?.count ?? 0);
    return { data: rows.rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getImport(importId: string, actor: ExecutiveImportActor) {
    this.assertAdmin(actor);
    const result = await this.db.query<ImportRecord>(
      `SELECT id, organization_id, created_by_id, dataset_type, status, file_name,
              source_headers, column_mapping, row_count, valid_row_count,
              invalid_row_count, duplicate_row_count, validation_summary, committed_at,
              created_at, updated_at
       FROM executive_imports
       WHERE id = $1 AND organization_id = $2`,
      [importId, actor.organizationId],
    );
    const item = result.rows[0];
    if (!item) throw new NotFoundException('Executive Intelligence import not found.');

    const rows = await this.db.query<ImportRowRecord>(
      `SELECT id, row_number, raw_data, normalized_data, validation_status,
              validation_errors, fingerprint, target_record_id
       FROM executive_import_rows
       WHERE organization_id = $1 AND import_id = $2
       ORDER BY row_number
       LIMIT $3`,
      [actor.organizationId, importId, this.previewLimit],
    );
    return { ...item, rows: rows.rows, previewLimit: this.previewLimit };
  }

  async validateImport(importId: string, mappingInput: unknown, actor: ExecutiveImportActor) {
    this.assertAdmin(actor);
    return this.db.transaction(async (client) => {
      const importResult = await client.query<ImportRecord>(
        `SELECT id, organization_id, dataset_type, status, source_headers,
                column_mapping, row_count
         FROM executive_imports
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [importId, actor.organizationId],
      );
      const item = importResult.rows[0];
      if (!item) throw new NotFoundException('Executive Intelligence import not found.');
      if (item.status === 'committed') throw new ConflictException('A committed import cannot be revalidated.');

      const mapping = this.validateMapping(item.dataset_type, mappingInput, item.source_headers);
      const rowResult = await client.query<ImportRowRecord>(
        `SELECT id, row_number, raw_data
         FROM executive_import_rows
         WHERE organization_id = $1 AND import_id = $2
         ORDER BY row_number`,
        [actor.organizationId, importId],
      );

      const normalized = rowResult.rows.map((row) => ({
        row,
        result: this.normalizeRow(item.dataset_type, row.raw_data, mapping, row.id),
      }));
      const candidates = normalized.filter((entry) => entry.result.normalized && entry.result.duplicateKey);
      const existingKeys = await this.findExistingDuplicateKeys(
        client,
        item.dataset_type,
        actor.organizationId,
        candidates.map((entry) => entry.result.duplicateKey as string),
      );
      const seen = new Set<string>();
      let validCount = 0;
      let invalidCount = 0;
      let duplicateCount = 0;
      const rowUpdates: Array<{
        id: string;
        normalizedData: Record<string, unknown> | null;
        validationStatus: 'valid' | 'invalid' | 'duplicate';
        validationErrors: string[];
        fingerprint: string | null;
      }> = [];

      for (const entry of normalized) {
        const { row, result } = entry;
        let status: 'valid' | 'invalid' | 'duplicate';
        const errors = [...result.errors];
        if (errors.length > 0 || !result.normalized || !result.fingerprint) {
          status = 'invalid';
          invalidCount += 1;
        } else if (result.duplicateKey && existingKeys.has(result.duplicateKey)) {
          status = 'duplicate';
          errors.push('A matching record already exists in this organisation.');
          duplicateCount += 1;
        } else if (result.duplicateKey && seen.has(result.duplicateKey)) {
          status = 'duplicate';
          errors.push('This row duplicates an earlier valid row in the same import.');
          duplicateCount += 1;
        } else {
          status = 'valid';
          validCount += 1;
          if (result.duplicateKey) seen.add(result.duplicateKey);
        }

        rowUpdates.push({
          id: row.id,
          normalizedData: result.normalized,
          validationStatus: status,
          validationErrors: errors,
          fingerprint: result.fingerprint,
        });
      }

      if (rowUpdates.length > 0) {
        await client.query(
          `UPDATE executive_import_rows AS target
           SET normalized_data = source.normalized_data,
               validation_status = source.validation_status,
               validation_errors = source.validation_errors,
               fingerprint = source.fingerprint,
               target_record_id = NULL,
               updated_at = NOW()
           FROM jsonb_to_recordset($3::jsonb) AS source(
             id uuid, normalized_data jsonb, validation_status text,
             validation_errors jsonb, fingerprint text
           )
           WHERE target.organization_id = $1
             AND target.import_id = $2
             AND target.id = source.id`,
          [actor.organizationId, importId, JSON.stringify(rowUpdates.map((row) => ({
            id: row.id,
            normalized_data: row.normalizedData,
            validation_status: row.validationStatus,
            validation_errors: row.validationErrors,
            fingerprint: row.fingerprint,
          })))],
        );
      }

      const duplicateRatio = rowResult.rows.length === 0 ? 0 : duplicateCount / rowResult.rows.length;
      const summary = {
        rowCount: rowResult.rows.length,
        validRowCount: validCount,
        invalidRowCount: invalidCount,
        duplicateRowCount: duplicateCount,
        validationVersion: 1,
        duplicateRatio,
        duplicateDetectionNote: item.dataset_type === 'transactions' && !mapping.external_reference
          ? 'Transactions without an external reference cannot be reliably deduplicated across separate imports; source-row identity is used to preserve legitimate identical transactions.'
          : null,
        mapping,
      };
      await client.query(
        `UPDATE executive_imports
         SET status = 'validated', column_mapping = $3::jsonb,
             row_count = $4, valid_row_count = $5, invalid_row_count = $6,
             duplicate_row_count = $7, validation_version = 1,
             validation_summary = $8::jsonb, updated_at = NOW()
         WHERE organization_id = $1 AND id = $2`,
        [actor.organizationId, importId, JSON.stringify(mapping), rowResult.rows.length,
          validCount, invalidCount, duplicateCount, JSON.stringify(summary)],
      );
      await client.query(
        `INSERT INTO executive_audit_events
          (organization_id, actor_id, event_type, entity_type, entity_id, details)
         VALUES ($1, $2, 'import_validated', 'import', $3, $4::jsonb)`,
        [actor.organizationId, actor.userId, importId, JSON.stringify(summary)],
      );
      return { importId, status: 'validated', ...summary };
    });
  }

  async commitImport(importId: string, confirmPartialInput: unknown, actor: ExecutiveImportActor) {
    this.assertAdmin(actor);
    const confirmPartial = confirmPartialInput === true;
    return this.db.transaction(async (client) => {
      const importResult = await client.query<ImportRecord>(
        `SELECT id, organization_id, dataset_type, status, row_count,
                valid_row_count, invalid_row_count, duplicate_row_count
         FROM executive_imports
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [importId, actor.organizationId],
      );
      const item = importResult.rows[0];
      if (!item) throw new NotFoundException('Executive Intelligence import not found.');
      if (item.status === 'committed') {
        return {
          importId, status: 'committed', alreadyCommitted: true,
          committedRows: item.valid_row_count,
          skippedInvalidRows: item.invalid_row_count,
          skippedDuplicateRows: item.duplicate_row_count,
        };
      }
      if (item.status !== 'validated') {
        throw new ConflictException('Import must be validated before it can be committed.');
      }
      const skipped = item.invalid_row_count + item.duplicate_row_count;
      if (skipped > 0 && !confirmPartial) {
        throw new BadRequestException(
          `Import contains ${skipped} invalid or duplicate rows. Set confirmPartial=true to commit only the ${item.valid_row_count} valid rows.`,
        );
      }
      if (item.valid_row_count < 1) throw new BadRequestException('There are no valid rows to commit.');

      const rowsResult = await client.query<ImportRowRecord>(
        `SELECT id, row_number, normalized_data, fingerprint
         FROM executive_import_rows
         WHERE organization_id = $1 AND import_id = $2 AND validation_status = 'valid'
         ORDER BY row_number
         FOR UPDATE`,
        [actor.organizationId, importId],
      );
      if (rowsResult.rows.length !== item.valid_row_count) {
        throw new ConflictException('Validated row counts changed. Revalidate this import before committing.');
      }

      const rowFingerprintMissing = rowsResult.rows.some((row) => !row.normalized_data || !row.fingerprint);
      if (rowFingerprintMissing) {
        throw new ConflictException('A validated row is missing normalized data or its fingerprint.');
      }

      let commitSql: string;
      let commitValues: unknown[];
      if (item.dataset_type === 'transactions') {
        commitSql = `WITH inserted AS (
          INSERT INTO executive_financial_transactions
            (organization_id, source_import_id, source_import_row_id,
             transaction_date, transaction_type, amount, currency,
             customer_key, external_reference, description, fingerprint,
             metadata, created_by_id)
          SELECT $1, $2, r.id,
                 r.normalized_data->>'transaction_date',
                 r.normalized_data->>'transaction_type',
                 (r.normalized_data->>'amount')::numeric,
                 r.normalized_data->>'currency',
                 r.normalized_data->>'customer_key',
                 r.normalized_data->>'external_reference',
                 r.normalized_data->>'description',
                 r.fingerprint,
                 jsonb_build_object('sourceRowNumber', r.row_number),
                 $3
          FROM executive_import_rows r
          WHERE r.organization_id = $1 AND r.import_id = $2
            AND r.validation_status = 'valid'
            AND r.normalized_data IS NOT NULL AND r.fingerprint IS NOT NULL
          ORDER BY r.row_number
          RETURNING id, source_import_row_id
        ), marked AS (
          UPDATE executive_import_rows r
          SET validation_status = 'committed', target_record_id = inserted.id,
              updated_at = NOW()
          FROM inserted
          WHERE r.organization_id = $1 AND r.import_id = $2
            AND r.id = inserted.source_import_row_id
          RETURNING r.id
        )
        SELECT COUNT(*)::int AS committed_rows FROM marked`;
        commitValues = [actor.organizationId, importId, actor.userId];
      } else if (item.dataset_type === 'contracts') {
        commitSql = `WITH inserted AS (
          INSERT INTO executive_customer_contracts
            (organization_id, source_import_id, source_import_row_id,
             external_contract_id, customer_key, status, recurring_amount,
             currency, billing_interval, start_date, end_date, cancelled_at,
             metadata, created_by_id)
          SELECT $1, $2, r.id,
                 r.normalized_data->>'external_contract_id',
                 r.normalized_data->>'customer_key',
                 r.normalized_data->>'status',
                 (r.normalized_data->>'recurring_amount')::numeric,
                 r.normalized_data->>'currency',
                 r.normalized_data->>'billing_interval',
                 (r.normalized_data->>'start_date')::date,
                 NULLIF(r.normalized_data->>'end_date', '')::date,
                 NULLIF(r.normalized_data->>'cancelled_at', '')::date,
                 jsonb_build_object('sourceRowNumber', r.row_number),
                 $3
          FROM executive_import_rows r
          WHERE r.organization_id = $1 AND r.import_id = $2
            AND r.validation_status = 'valid'
            AND r.normalized_data IS NOT NULL AND r.fingerprint IS NOT NULL
          ORDER BY r.row_number
          RETURNING id, source_import_row_id
        ), marked AS (
          UPDATE executive_import_rows r
          SET validation_status = 'committed', target_record_id = inserted.id,
              updated_at = NOW()
          FROM inserted
          WHERE r.organization_id = $1 AND r.import_id = $2
            AND r.id = inserted.source_import_row_id
          RETURNING r.id
        )
        SELECT COUNT(*)::int AS committed_rows FROM marked`;
        commitValues = [actor.organizationId, importId, actor.userId];
      } else {
        commitSql = `WITH inserted AS (
          INSERT INTO executive_pipeline_opportunities
            (organization_id, source_import_id, source_import_row_id,
             external_opportunity_id, customer_key, title, stage, status,
             amount, currency, probability, expected_close_date, closed_at,
             metadata, created_by_id)
          SELECT $1, $2, r.id,
                 r.normalized_data->>'external_opportunity_id',
                 r.normalized_data->>'customer_key',
                 r.normalized_data->>'title',
                 r.normalized_data->>'stage',
                 r.normalized_data->>'status',
                 (r.normalized_data->>'amount')::numeric,
                 r.normalized_data->>'currency',
                 (r.normalized_data->>'probability')::numeric,
                 NULLIF(r.normalized_data->>'expected_close_date', '')::date,
                 NULLIF(r.normalized_data->>'closed_at', '')::date,
                 jsonb_build_object('sourceRowNumber', r.row_number),
                 $3
          FROM executive_import_rows r
          WHERE r.organization_id = $1 AND r.import_id = $2
            AND r.validation_status = 'valid'
            AND r.normalized_data IS NOT NULL AND r.fingerprint IS NOT NULL
          ORDER BY r.row_number
          RETURNING id, source_import_row_id
        ), marked AS (
          UPDATE executive_import_rows r
          SET validation_status = 'committed', target_record_id = inserted.id,
              updated_at = NOW()
          FROM inserted
          WHERE r.organization_id = $1 AND r.import_id = $2
            AND r.id = inserted.source_import_row_id
          RETURNING r.id
        )
        SELECT COUNT(*)::int AS committed_rows FROM marked`;
        commitValues = [actor.organizationId, importId, actor.userId];
      }

      const commitResult = await client.query<{ committed_rows: number }>(commitSql, commitValues);
      const committed = Number(commitResult.rows[0]?.committed_rows ?? 0);
      if (committed !== rowsResult.rows.length) {
        throw new ConflictException('The number of committed records did not match the validated row count. The transaction was rolled back.');
      }

      const resultSummary = {
        datasetType: item.dataset_type,
        committedRows: committed,
        skippedInvalidRows: item.invalid_row_count,
        skippedDuplicateRows: item.duplicate_row_count,
      };
      await client.query(
        `UPDATE executive_imports
         SET status = 'committed', committed_at = NOW(),
             validation_summary = validation_summary || $3::jsonb,
             updated_at = NOW()
         WHERE organization_id = $1 AND id = $2`,
        [actor.organizationId, importId, JSON.stringify(resultSummary)],
      );
      await client.query(
        `INSERT INTO executive_audit_events
          (organization_id, actor_id, event_type, entity_type, entity_id, details)
         VALUES ($1, $2, 'import_committed', 'import', $3, $4::jsonb)`,
        [actor.organizationId, actor.userId, importId, JSON.stringify(resultSummary)],
      );
      await this.luiePublisher.append(client, {
        organizationId: actor.organizationId,
        eventKey: `financial.import_committed:${importId}`,
        eventType: 'financial.import_committed',
        aggregateType: 'financial_import',
        aggregateId: importId,
        actorId: actor.userId,
        payload: {
          importId,
          datasetType: item.dataset_type,
          committedRows: committed,
          skippedInvalidRows: item.invalid_row_count,
          skippedDuplicateRows: item.duplicate_row_count,
        },
      }, ['luie.legacy-domain-bridge']);
      return { importId, status: 'committed', alreadyCommitted: false, ...resultSummary };
    });
  }

  async proposeFinancialCandidates(input: {
    organizationId: string;
    documentId: string;
    teamId: string | null;
    actorId: string | null;
    chunks: FinancialCandidateSourceChunk[];
  }): Promise<{ created: number }> {
    const proposals = input.chunks
      .map((chunk) => this.detectFinancialCandidate(chunk))
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .slice(0, 20);
    if (proposals.length === 0) return { created: 0 };

    return this.db.transaction(async (client) => {
      let created = 0;
      for (const proposal of proposals) {
        const fingerprint = this.hash({
          organizationId: input.organizationId,
          documentId: input.documentId,
          sourceChunkId: proposal.chunkId,
          transactionDate: proposal.transactionDate,
          transactionType: proposal.transactionType,
          amount: proposal.amount,
          currency: proposal.currency,
        });
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO executive_financial_candidates (
             organization_id, document_id, source_chunk_id, team_id,
             transaction_date, transaction_type, amount, currency,
             description, evidence_excerpt, confidence, fingerprint, proposed_by_id
           )
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid,
                   $5::date, $6, $7::numeric, $8, $9, $10, $11, $12, $13::uuid)
           ON CONFLICT (organization_id, fingerprint) DO NOTHING
           RETURNING id`,
          [
            input.organizationId,
            input.documentId,
            proposal.chunkId,
            input.teamId,
            proposal.transactionDate,
            proposal.transactionType,
            proposal.amount,
            proposal.currency,
            proposal.description,
            proposal.evidenceExcerpt,
            proposal.confidence,
            fingerprint,
            input.actorId,
          ],
        );
        const candidateId = inserted.rows[0]?.id;
        if (!candidateId) continue;

        await this.luiePublisher.append(client, {
          organizationId: input.organizationId,
          eventKey: `financial.candidate_proposed:${candidateId}`,
          eventType: 'financial.candidate_proposed',
          aggregateType: 'financial_candidate',
          aggregateId: candidateId,
          actorId: input.actorId,
          teamId: input.teamId,
          payload: {
            candidateId,
            documentId: input.documentId,
            sourceChunkId: proposal.chunkId,
            transactionDate: proposal.transactionDate,
            transactionType: proposal.transactionType,
            amount: proposal.amount,
            currency: proposal.currency,
            status: 'pending',
          },
        }, ['luie.legacy-domain-bridge']);
        created += 1;
      }
      return { created };
    });
  }

  async listFinancialCandidates(
    actor: ExecutiveImportActor,
    statusInput?: unknown,
    limitInput?: unknown,
  ) {
    this.assertAdmin(actor);
    const status = statusInput === undefined ? 'pending' : String(statusInput);
    if (!['pending', 'approved', 'rejected', 'committed', 'all'].includes(status)) {
      throw new BadRequestException('Candidate status must be pending, approved, rejected, committed or all.');
    }
    const limit = this.positiveInteger(limitInput, 50, 200);
    const result = await this.db.query(
      `SELECT candidate.id, candidate.document_id, candidate.source_chunk_id,
              candidate.team_id, candidate.transaction_date, candidate.transaction_type,
              candidate.amount, candidate.currency, candidate.description,
              candidate.evidence_excerpt, candidate.confidence, candidate.status,
              candidate.reviewed_by_id, candidate.reviewed_at,
              candidate.rejection_reason, candidate.target_record_id,
              document.name AS document_name, chunk.chunk_index
         FROM executive_financial_candidates candidate
         JOIN documents document
           ON document.id = candidate.document_id
          AND document.organization_id = candidate.organization_id
          AND document.status::text = 'indexed'
         LEFT JOIN document_chunks chunk
           ON chunk.id = candidate.source_chunk_id
          AND chunk.document_id = candidate.document_id
        WHERE candidate.organization_id = $1::uuid
          AND ($2::text = 'all' OR candidate.status = $2::text)
        ORDER BY candidate.created_at DESC, candidate.id DESC
        LIMIT $3`,
      [actor.organizationId, status, limit],
    );
    return { data: result.rows, limit, status };
  }

  async rejectFinancialCandidate(
    candidateId: string,
    reasonInput: unknown,
    actor: ExecutiveImportActor,
  ) {
    this.assertAdmin(actor);
    if (!UUID_PATTERN.test(candidateId)) throw new BadRequestException('Invalid financial candidate ID.');
    const reason = typeof reasonInput === 'string' ? reasonInput.trim().slice(0, 1000) : '';
    if (!reason) throw new BadRequestException('A rejection reason is required.');

    return this.db.transaction(async (client) => {
      const selected = await client.query<FinancialCandidateRow>(
        `SELECT id, organization_id, document_id, source_chunk_id, team_id,
                transaction_date, transaction_type, amount, currency, description,
                evidence_excerpt, confidence, status, source_import_id, target_record_id
           FROM executive_financial_candidates
          WHERE organization_id = $1::uuid AND id = $2::uuid
          FOR UPDATE`,
        [actor.organizationId, candidateId],
      );
      const candidate = selected.rows[0];
      if (!candidate) throw new NotFoundException('Financial candidate not found.');
      if (candidate.status !== 'pending') {
        throw new ConflictException('Only pending financial candidates can be rejected.');
      }
      await client.query(
        `UPDATE executive_financial_candidates
            SET status = 'rejected', reviewed_by_id = $3::uuid,
                reviewed_at = NOW(), rejection_reason = $4, updated_at = NOW()
          WHERE organization_id = $1::uuid AND id = $2::uuid`,
        [actor.organizationId, candidateId, actor.userId, reason],
      );
      await client.query(
        `INSERT INTO executive_audit_events
          (organization_id, actor_id, event_type, entity_type, entity_id, details)
         VALUES ($1::uuid, $2::uuid, 'financial_candidate_rejected',
                 'financial_candidate', $3::uuid, $4::jsonb)`,
        [actor.organizationId, actor.userId, candidateId, JSON.stringify({ reason })],
      );
      await this.luiePublisher.append(client, {
        organizationId: actor.organizationId,
        eventKey: `financial.candidate_rejected:${candidateId}`,
        eventType: 'financial.candidate_rejected',
        aggregateType: 'financial_candidate',
        aggregateId: candidateId,
        actorId: actor.userId,
        teamId: candidate.team_id,
        payload: { candidateId, status: 'rejected', reason },
      }, ['luie.legacy-domain-bridge']);
      return { candidateId, status: 'rejected' };
    });
  }

  async approveFinancialCandidate(
    candidateId: string,
    actor: ExecutiveImportActor,
  ) {
    this.assertAdmin(actor);
    if (!UUID_PATTERN.test(candidateId)) throw new BadRequestException('Invalid financial candidate ID.');

    const importId = await this.db.transaction(async (client) => {
      const selected = await client.query<FinancialCandidateRow>(
        `SELECT id, organization_id, document_id, source_chunk_id, team_id,
                transaction_date, transaction_type, amount, currency, description,
                evidence_excerpt, confidence, status, source_import_id, target_record_id
           FROM executive_financial_candidates
          WHERE organization_id = $1::uuid AND id = $2::uuid
          FOR UPDATE`,
        [actor.organizationId, candidateId],
      );
      const candidate = selected.rows[0];
      if (!candidate) throw new NotFoundException('Financial candidate not found.');
      if (candidate.status === 'committed') {
        return candidate.source_import_id;
      }
      if (candidate.status === 'rejected') {
        throw new ConflictException('A rejected financial candidate cannot be approved.');
      }

      if (candidate.status === 'pending') {
        await client.query(
          `UPDATE executive_financial_candidates
              SET status = 'approved', reviewed_by_id = $3::uuid,
                  reviewed_at = NOW(), updated_at = NOW()
            WHERE organization_id = $1::uuid AND id = $2::uuid`,
          [actor.organizationId, candidateId, actor.userId],
        );
        await this.luiePublisher.append(client, {
          organizationId: actor.organizationId,
          eventKey: `financial.candidate_approved:${candidateId}`,
          eventType: 'financial.candidate_approved',
          aggregateType: 'financial_candidate',
          aggregateId: candidateId,
          actorId: actor.userId,
          teamId: candidate.team_id,
          payload: { candidateId, status: 'approved' },
        }, ['luie.legacy-domain-bridge']);
      }

      if (candidate.source_import_id) return candidate.source_import_id;

      const stagedImportId = uuidv4();
      const rowId = uuidv4();
      const headers = [
        'transaction_date', 'transaction_type', 'amount',
        'currency', 'external_reference', 'description',
      ];
      const rawData = {
        transaction_date: new Date(candidate.transaction_date).toISOString().slice(0, 10),
        transaction_type: candidate.transaction_type,
        amount: String(candidate.amount),
        currency: candidate.currency.trim(),
        external_reference: `luie-candidate:${candidateId}`,
        description: candidate.description,
      };
      await client.query(
        `INSERT INTO executive_imports (
           id, organization_id, created_by_id, dataset_type, status, file_name,
           file_sha256, source_headers, column_mapping, row_count
         )
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'transactions', 'mapping_required',
                 $4, $5, $6::jsonb, '{}'::jsonb, 1)`,
        [
          stagedImportId,
          actor.organizationId,
          actor.userId,
          `LUIE candidate ${candidateId}.csv`,
          this.hash({ candidateId, source: 'luie_financial_candidate' }),
          JSON.stringify(headers),
        ],
      );
      await client.query(
        `INSERT INTO executive_import_rows (
           id, organization_id, import_id, row_number, raw_data,
           validation_status, validation_errors
         )
         VALUES ($1::uuid, $2::uuid, $3::uuid, 1, $4::jsonb, 'pending', '[]'::jsonb)`,
        [rowId, actor.organizationId, stagedImportId, JSON.stringify(rawData)],
      );
      await client.query(
        `UPDATE executive_financial_candidates
            SET source_import_id = $3::uuid, updated_at = NOW()
          WHERE organization_id = $1::uuid AND id = $2::uuid`,
        [actor.organizationId, candidateId, stagedImportId],
      );
      await client.query(
        `INSERT INTO executive_audit_events
          (organization_id, actor_id, event_type, entity_type, entity_id, details)
         VALUES ($1::uuid, $2::uuid, 'financial_candidate_staged',
                 'financial_candidate', $3::uuid, $4::jsonb)`,
        [actor.organizationId, actor.userId, candidateId, JSON.stringify({ importId: stagedImportId })],
      );
      return stagedImportId;
    });

    if (!importId) throw new ConflictException('The approved candidate has no staged import.');
    const importResult = await this.db.query<{ status: string }>(
      `SELECT status FROM executive_imports
        WHERE organization_id = $1::uuid AND id = $2::uuid`,
      [actor.organizationId, importId],
    );
    const importStatus = importResult.rows[0]?.status;
    if (!importStatus) throw new NotFoundException('The candidate import could not be found.');

    if (!['validated', 'committed'].includes(importStatus)) {
      const validation = await this.validateImport(importId, {
        transaction_date: 'transaction_date',
        transaction_type: 'transaction_type',
        amount: 'amount',
        currency: 'currency',
        external_reference: 'external_reference',
        description: 'description',
      }, actor);
      if (validation.validRowCount !== 1) {
        throw new ConflictException('The approved candidate failed Executive Intelligence import validation.');
      }
    }
    if (importStatus !== 'committed') {
      await this.commitImport(importId, false, actor);
    }

    const transaction = await this.db.query<{ id: string }>(
      `SELECT id FROM executive_financial_transactions
        WHERE organization_id = $1::uuid AND source_import_id = $2::uuid
        LIMIT 1`,
      [actor.organizationId, importId],
    );
    const targetRecordId = transaction.rows[0]?.id;
    if (!targetRecordId) throw new ConflictException('The approved import committed without a financial transaction.');

    await this.db.transaction(async (client) => {
      const updated = await client.query(
        `UPDATE executive_financial_candidates
            SET status = 'committed', target_record_id = $3::uuid,
                updated_at = NOW()
          WHERE organization_id = $1::uuid AND id = $2::uuid
            AND status = 'approved'
          RETURNING id`,
        [actor.organizationId, candidateId, targetRecordId],
      );
      if (!updated.rows[0]) {
        const current = await client.query<{ status: string }>(
          `SELECT status FROM executive_financial_candidates
            WHERE organization_id = $1::uuid AND id = $2::uuid`,
          [actor.organizationId, candidateId],
        );
        if (current.rows[0]?.status === 'committed') return;
        throw new ConflictException('The candidate changed before its committed record could be linked.');
      }
      await client.query(
        `INSERT INTO executive_audit_events
          (organization_id, actor_id, event_type, entity_type, entity_id, details)
         VALUES ($1::uuid, $2::uuid, 'financial_candidate_committed',
                 'financial_candidate', $3::uuid, $4::jsonb)`,
        [actor.organizationId, actor.userId, candidateId, JSON.stringify({ importId, targetRecordId })],
      );
      await this.luiePublisher.append(client, {
        organizationId: actor.organizationId,
        eventKey: `financial.candidate_committed:${candidateId}`,
        eventType: 'financial.candidate_committed',
        aggregateType: 'financial_candidate',
        aggregateId: candidateId,
        actorId: actor.userId,
        payload: { candidateId, importId, targetRecordId, status: 'committed' },
      }, ['luie.legacy-domain-bridge']);
    });

    return { candidateId, importId, targetRecordId, status: 'committed' };
  }

  private detectFinancialCandidate(chunk: FinancialCandidateSourceChunk): {
    chunkId: string;
    transactionDate: string;
    transactionType: typeof TRANSACTION_TYPES[number];
    amount: string;
    currency: string;
    description: string;
    evidenceExcerpt: string;
    confidence: number;
  } | null {
    const content = chunk.content.trim();
    if (/\b(?:may|might|could|would|will|forecast|projected|projection|expected|planned|estimated|estimate|budget|target|potential)\b/i.test(content)) {
      return null;
    }

    const dateMatches = [...content.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)];
    const dateRanges = dateMatches.map((match) => ({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    }));
    const amountMatches = [...content.matchAll(/\b([A-Z]{3})\s*([0-9][0-9,]*(?:\.[0-9]{1,6})?)\b|\b([0-9][0-9,]*(?:\.[0-9]{1,6})?)\s*([A-Z]{3})\b/gi)]
      .filter((match) => {
        const index = match.index ?? 0;
        return !dateRanges.some((range) => index >= range.start && index < range.end);
      });
    if (dateMatches.length !== 1 || amountMatches.length !== 1) return null;

    const transactionDate = dateMatches[0][0];
    const parsedDate = new Date(`${transactionDate}T00:00:00.000Z`);
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== transactionDate) {
      return null;
    }

    const amountMatch = amountMatches[0];
    const currency = (amountMatch[1] ?? amountMatch[4] ?? '').toUpperCase();
    const amount = (amountMatch[2] ?? amountMatch[3] ?? '').replace(/,/g, '');
    if (!/^\d{1,14}(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) return null;

    const rules: Array<{ type: typeof TRANSACTION_TYPES[number]; pattern: RegExp }> = [
      { type: 'refund', pattern: /\brefund(?:ed)?\b/i },
      { type: 'acquisition_cost', pattern: /\bacquisition cost\b/i },
      { type: 'cost_of_goods_sold', pattern: /\bcost of goods sold\b|\bcogs\b/i },
      { type: 'operating_expense', pattern: /\boperating expense\b|\bexpense paid\b/i },
      { type: 'capital_expenditure', pattern: /\bcapital expenditure\b|\bcapex\b/i },
      { type: 'tax', pattern: /\btax paid\b|\btax expense\b/i },
      { type: 'other_income', pattern: /\binterest income\b|\bother income\b/i },
      { type: 'revenue', pattern: /\brevenue received\b|\bsales revenue\b|\brevenue\b/i },
    ];
    const rule = rules.find((item) => item.pattern.test(content));
    if (!rule) return null;

    const dateIndex = dateMatches[0].index ?? 0;
    const amountIndex = amountMatch.index ?? 0;
    const first = Math.min(dateIndex, amountIndex);
    const last = Math.max(dateIndex + transactionDate.length, amountIndex + amountMatch[0].length);
    if (last - first > 3800) return null;
    const start = Math.max(0, first - 100);
    const end = Math.min(content.length, last + 100);
    const evidenceExcerpt = content.slice(start, end).slice(0, 4000);

    return {
      chunkId: chunk.chunkId,
      transactionDate,
      transactionType: rule.type,
      amount,
      currency,
      description: evidenceExcerpt.slice(0, 2000),
      evidenceExcerpt,
      confidence: 0.65,
    };
  }

  private assertAdmin(actor: ExecutiveImportActor): void {
    if (!actor?.organizationId || !actor?.userId) {
      throw new ForbiddenException('Authenticated organisation and user context are required.');
    }
    const role = String(actor.role ?? '').toLowerCase();
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenException('Only organisation owners and administrators can access Executive Intelligence financial imports.');
    }
  }

  private parseDatasetType(value: unknown): ExecutiveDatasetType {
    if (value === 'transactions' || value === 'contracts' || value === 'pipeline') return value;
    throw new BadRequestException('datasetType must be transactions, contracts or pipeline.');
  }

  private parseWorkbook(buffer: Buffer): ParsedImportFile {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: true });
    } catch {
      throw new BadRequestException('The uploaded file could not be parsed as CSV or XLSX.');
    }
    const firstSheetName = workbook.SheetNames[0];
    const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
    if (!sheet) throw new BadRequestException('The uploaded file contains no worksheet.');

    let matrix: unknown[][];
    try {
      matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1, raw: true, defval: null, blankrows: false,
      });
    } catch {
      throw new BadRequestException('The first worksheet could not be read.');
    }
    if (matrix.length < 2) throw new BadRequestException('The file must contain a header row and at least one data row.');
    if (matrix.length - 1 > this.maxRows) throw new BadRequestException(`Imports are limited to ${this.maxRows} data rows.`);

    const headerCells = matrix[0] ?? [];
    if (headerCells.length < 1 || headerCells.length > this.maxColumns) {
      throw new BadRequestException(`The file must contain between 1 and ${this.maxColumns} columns.`);
    }
    const headers = headerCells.map((value) => String(value ?? '').trim());
    if (headers.some((header) => !header)) throw new BadRequestException('Every source column must have a non-empty header.');
    const seenHeaders = new Set<string>();
    for (const header of headers) {
      const normalized = header.toLocaleLowerCase();
      if (seenHeaders.has(normalized)) throw new BadRequestException(`Duplicate source column header: ${header}`);
      seenHeaders.add(normalized);
    }

    const rows: ParsedImportFile['rows'] = [];
    matrix.slice(1).forEach((values, index) => {
      const cells = values ?? [];
      if (!cells.some((value) => value !== null && value !== undefined && String(value).trim() !== '')) return;
      const rawData: Record<string, unknown> = {};
      headers.forEach((header, columnIndex) => {
        const value = cells[columnIndex];
        rawData[header] = value instanceof Date ? value.toISOString().slice(0, 10) : (value ?? null);
      });
      rows.push({ rowNumber: index + 2, rawData });
    });
    if (rows.length < 1) throw new BadRequestException('The file contains no non-empty data rows.');
    if (rows.length > this.maxRows) throw new BadRequestException(`Imports are limited to ${this.maxRows} data rows.`);
    return { headers, rows };
  }

  private validateMapping(
    datasetType: ExecutiveDatasetType,
    value: unknown,
    headers: string[],
  ): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('A source-column mapping object is required.');
    }
    const input = value as Record<string, unknown>;
    const allowed = [...DATASET_FIELDS[datasetType].required, ...DATASET_FIELDS[datasetType].optional];
    for (const key of Object.keys(input)) {
      if (!allowed.includes(key)) throw new BadRequestException(`Unsupported mapping field '${key}' for ${datasetType}.`);
    }
    const mapping: Record<string, string> = {};
    for (const field of DATASET_FIELDS[datasetType].required) {
      const header = input[field];
      if (typeof header !== 'string' || !headers.includes(header)) {
        throw new BadRequestException(`A valid source column must be mapped to required field '${field}'.`);
      }
      mapping[field] = header;
    }
    for (const field of DATASET_FIELDS[datasetType].optional) {
      const header = input[field];
      if (header === undefined || header === null || header === '') continue;
      if (typeof header !== 'string' || !headers.includes(header)) {
        throw new BadRequestException(`Mapping for '${field}' must reference an existing source column.`);
      }
      mapping[field] = header;
    }
    const mappedHeaders = Object.values(mapping);
    if (new Set(mappedHeaders).size !== mappedHeaders.length) {
      throw new BadRequestException('Each source column can be mapped to only one destination field.');
    }
    return mapping;
  }

  private normalizeRow(
    datasetType: ExecutiveDatasetType,
    raw: Record<string, unknown>,
    mapping: Record<string, string>,
    sourceRowId: string,
  ): NormalizedRow {
    const errors: string[] = [];
    const read = (field: string): unknown => mapping[field] ? raw[mapping[field]] : null;
    const text = (field: string, max: number, required = false): string | null => {
      const value = read(field);
      if (value === null || value === undefined || String(value).trim() === '') {
        if (required) errors.push(`${field} is required.`);
        return null;
      }
      const normalized = String(value).trim();
      if (normalized.length > max) errors.push(`${field} must not exceed ${max} characters.`);
      return normalized.slice(0, max);
    };
    const currency = (): string | null => {
      const value = text('currency', 3, true)?.toUpperCase() ?? null;
      if (value && !/^[A-Z]{3}$/.test(value)) errors.push('currency must be a three-letter ISO currency code.');
      return value;
    };
    const positiveAmount = (field: string): string | null => {
      const value = read(field);
      if (value === null || value === undefined || String(value).trim() === '') {
        errors.push(`${field} is required.`);
        return null;
      }
      let normalized: string;
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) { errors.push(`${field} must be a finite positive number.`); return null; }
        normalized = String(value);
      } else {
        normalized = String(value).trim();
        if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) normalized = normalized.replace(/,/g, '');
      }
      if (!/^(?:\d+)(?:\.\d+)?$/.test(normalized) || !Number.isFinite(Number(normalized)) || Number(normalized) <= 0) {
        errors.push(`${field} must be a positive decimal number. Do not include a currency symbol.`);
        return null;
      }
      const [wholePart, fractionalPart = ''] = normalized.split('.');
      if (wholePart.length > 14 || fractionalPart.length > 6) {
        errors.push(`${field} must fit the database precision of 14 integer and 6 fractional digits.`);
        return null;
      }
      return normalized;
    };
    const date = (field: string, required: boolean): string | null => {
      const value = read(field);
      if (value === null || value === undefined || String(value).trim() === '') {
        if (required) errors.push(`${field} is required.`);
        return null;
      }
      if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
      if (typeof value === 'number') {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed && parsed.y && parsed.m && parsed.d) {
          return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        }
      }
      const candidate = String(value).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
        errors.push(`${field} must use YYYY-MM-DD or a valid Excel date cell.`);
        return null;
      }
      const parsed = new Date(`${candidate}T00:00:00.000Z`);
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate) {
        errors.push(`${field} is not a valid calendar date.`);
        return null;
      }
      return candidate;
    };
    const enumValue = <T extends readonly string[]>(field: string, values: T): T[number] | null => {
      const value = text(field, 100, true)?.toLowerCase() ?? null;
      if (value && !(values as readonly string[]).includes(value)) {
        errors.push(`${field} must be one of: ${values.join(', ')}.`);
        return null;
      }
      return value as T[number] | null;
    };

    let normalized: Record<string, unknown> | null = null;
    let duplicateKey: string | null = null;
    if (datasetType === 'transactions') {
      const transactionDate = date('transaction_date', true);
      const transactionType = enumValue('transaction_type', TRANSACTION_TYPES);
      const amount = positiveAmount('amount');
      const currencyValue = currency();
      const customerKey = text('customer_key', 200);
      const externalReference = text('external_reference', 200);
      const description = text('description', 2000);
      if (transactionDate && transactionType && amount && currencyValue) {
        normalized = {
          transaction_date: transactionDate, transaction_type: transactionType,
          amount, currency: currencyValue, customer_key: customerKey,
          external_reference: externalReference, description,
        };
      }
      if (normalized && externalReference) duplicateKey = this.hash({ external_reference: externalReference.toLowerCase() });
    } else if (datasetType === 'contracts') {
      const externalContractId = text('external_contract_id', 200, true);
      const customerKey = text('customer_key', 200, true);
      const status = enumValue('status', CONTRACT_STATUSES);
      const amount = positiveAmount('recurring_amount');
      const currencyValue = currency();
      const interval = enumValue('billing_interval', BILLING_INTERVALS);
      const startDate = date('start_date', true);
      const endDate = date('end_date', false);
      const cancelledAt = date('cancelled_at', false);
      if (startDate && endDate && endDate < startDate) errors.push('end_date cannot precede start_date.');
      if (startDate && cancelledAt && cancelledAt < startDate) errors.push('cancelled_at cannot precede start_date.');
      if (externalContractId && customerKey && status && amount && currencyValue && interval && startDate) {
        normalized = {
          external_contract_id: externalContractId, customer_key: customerKey,
          status, recurring_amount: amount, currency: currencyValue,
          billing_interval: interval, start_date: startDate,
          end_date: endDate, cancelled_at: cancelledAt,
        };
        duplicateKey = externalContractId;
      }
    } else {
      const externalOpportunityId = text('external_opportunity_id', 200, true);
      const customerKey = text('customer_key', 200);
      const title = text('title', 500, true);
      const stage = text('stage', 100, true);
      const status = enumValue('status', PIPELINE_STATUSES);
      const amount = positiveAmount('amount');
      const currencyValue = currency();
      const probabilityRaw = read('probability');
      let probability: number | null = null;
      if (probabilityRaw === null || probabilityRaw === undefined || String(probabilityRaw).trim() === '') {
        errors.push('probability is required.');
      } else {
        const rawProbability = String(probabilityRaw).trim();
        const isPercent = rawProbability.endsWith('%');
        const parsed = Number(isPercent ? rawProbability.slice(0, -1) : rawProbability);
        if (!Number.isFinite(parsed) || parsed < 0 || (isPercent ? parsed > 100 : parsed > 100)) {
          errors.push('probability must be between 0 and 1, or a percentage between 0% and 100%.');
        } else {
          probability = parsed > 1 || isPercent ? parsed / 100 : parsed;
        }
      }
      const expectedCloseDate = date('expected_close_date', false);
      const closedAt = date('closed_at', false);
      if (externalOpportunityId && title && stage && status && amount && currencyValue && probability !== null) {
        normalized = {
          external_opportunity_id: externalOpportunityId, customer_key: customerKey,
          title, stage, status, amount, currency: currencyValue, probability,
          expected_close_date: expectedCloseDate, closed_at: closedAt,
        };
        duplicateKey = externalOpportunityId;
      }
    }

    if (errors.length > 0) return { normalized: null, fingerprint: null, duplicateKey: null, errors };
    if (!normalized) return { normalized: null, fingerprint: null, duplicateKey: null, errors: ['Row could not be normalized.'] };
    const fingerprint = datasetType === 'transactions'
      ? (duplicateKey ?? this.hash({ ...normalized, source_row_id: sourceRowId }))
      : this.hash(normalized);
    return { normalized, fingerprint, duplicateKey, errors };
  }

  private async findExistingDuplicateKeys(
    client: PoolClient,
    datasetType: ExecutiveDatasetType,
    organizationId: string,
    keys: string[],
  ): Promise<Set<string>> {
    const uniqueKeys = [...new Set(keys)];
    if (uniqueKeys.length === 0) return new Set<string>();
    let result: { rows: Array<{ duplicate_key: string }> };
    if (datasetType === 'transactions') {
      result = await client.query<{ duplicate_key: string }>(
        `SELECT fingerprint::text AS duplicate_key
         FROM executive_financial_transactions
         WHERE organization_id = $1 AND fingerprint = ANY($2::char(64)[])`,
        [organizationId, uniqueKeys],
      );
    } else if (datasetType === 'contracts') {
      result = await client.query<{ duplicate_key: string }>(
        `SELECT external_contract_id AS duplicate_key
         FROM executive_customer_contracts
         WHERE organization_id = $1 AND external_contract_id = ANY($2::text[])`,
        [organizationId, uniqueKeys],
      );
    } else {
      result = await client.query<{ duplicate_key: string }>(
        `SELECT external_opportunity_id AS duplicate_key
         FROM executive_pipeline_opportunities
         WHERE organization_id = $1 AND external_opportunity_id = ANY($2::text[])`,
        [organizationId, uniqueKeys],
      );
    }
    return new Set(result.rows.map((row) => String(row.duplicate_key).trim()));
  }

  private hash(value: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
  }

  private positiveInteger(value: unknown, fallback: number, max: number): number {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(max, Math.floor(parsed));
  }
}