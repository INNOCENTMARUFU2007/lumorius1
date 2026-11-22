import * as XLSX from 'xlsx';
import { ExecutiveImportService } from './executive-import.service';

describe('ExecutiveImportService', () => {
  let service: ExecutiveImportService;
  let db: any;
  let client: any;
  let publisher: any;

  const actor = {
    organizationId: '22222222-2222-4222-8222-222222222222',
    userId: '33333333-3333-4333-8333-333333333333',
    role: 'owner',
  };

  const makeFile = (rows: unknown[][], name = 'transactions.xlsx'): Express.Multer.File => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Data');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return { buffer, originalname: name, size: buffer.length } as Express.Multer.File;
  };

  beforeEach(() => {
    client = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    db = {
      query: jest.fn(),
      transaction: jest.fn(async (callback: (connection: any) => Promise<any>) => callback(client)),
    };
    publisher = { append: jest.fn().mockResolvedValue({ eventId: 'event-1', duplicate: false, deliveriesInserted: 1 }) };
    service = new ExecutiveImportService(db, publisher);
  });

  it('accepts files with blank spacer columns, blank headers over data and repeated headers', () => {
    const parse = (rows: unknown[][]) =>
      (service as unknown as { parseWorkbook: (b: Buffer) => { headers: string[]; rows: Array<{ rawData: Record<string, unknown> }> } })
        .parseWorkbook(makeFile(rows).buffer);

    const parsed = parse([
      ['Date', null, 'Amount', null, 'Amount', null],
      ['2026-11-01', null, 120, 'note', 5, null],
      ['2026-11-02', null, 80, null, 6, null],
    ]);
    // Column B (blank, no data) and F (blank, no data) are dropped; D gets a letter name; the second Amount is numbered.
    expect(parsed.headers).toEqual(['Date', 'Amount', 'Column D', 'Amount (2)']);
    expect(parsed.rows[0].rawData).toEqual({ Date: '2026-11-01', Amount: 120, 'Column D': 'note', 'Amount (2)': 5 });
  });

  it('finds the real header row below a form title block (expense report layout)', () => {
    const parse = (rows: unknown[][]) =>
      (service as unknown as { parseWorkbook: (b: Buffer) => { headers: string[]; rows: Array<{ rowNumber: number; rawData: Record<string, unknown> }> } })
        .parseWorkbook(makeFile(rows).buffer);
    const parsed = parse([
      ['Your Company Name', 'INMARTECH PVT LTD', null, null, null],
      ['Expense Report', null, null, null, null],
      ['PURPOSE:', 'Business meeting', null, 'STATEMENT NUMBER:', 1106],
      ['Date', 'Account', 'Description', 'Hotel', 'Total'],
      ['2026-06-30', 5524366200, 'approved', 5500, 17550],
    ]);
    expect(parsed.headers).toEqual(['Date', 'Account', 'Description', 'Hotel', 'Total']);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].rawData.Total).toBe(17550);
  });

  it('accepts a fixed value for a field the file has no column for, and lets one column feed two fields', () => {
    const validate = (mapping: Record<string, string>) =>
      (service as unknown as { validateMapping: (t: string, m: unknown, h: string[]) => Record<string, string> })
        .validateMapping('transactions', mapping, ['Date', 'Total', 'Description']);
    const mapping = validate({
      transaction_date: 'Date',
      transaction_type: '__fixed__:operating_expense',
      amount: 'Total',
      currency: '__fixed__:USD',
      description: 'Description',
      external_reference: 'Description',
    });
    expect(mapping.currency).toBe('__fixed__:USD');
    expect(() => validate({ transaction_date: 'Date', transaction_type: 'Nope', amount: 'Total', currency: '__fixed__:USD' }))
      .toThrow('Choose a source column or enter a fixed value');
  });

  it('turns an expense-report row into a valid transaction using fixed type and currency', () => {
    const normalize = (service as unknown as {
      normalizeRow: (t: string, raw: Record<string, unknown>, m: Record<string, string>, id: string) => { normalized: Record<string, unknown> | null; errors: string[] };
    }).normalizeRow.bind(service);
    const result = normalize('transactions', { Date: '2026-06-30', Total: 17550, Description: 'approved' }, {
      transaction_date: 'Date',
      transaction_type: '__fixed__:operating_expense',
      amount: 'Total',
      currency: '__fixed__:usd',
      description: 'Description',
    }, 'row-9');
    expect(result.errors).toEqual([]);
    expect(result.normalized).toMatchObject({ transaction_type: 'operating_expense', currency: 'USD', transaction_date: '2026-06-30' });
  });

  it('rejects non-administrator access before touching the database', async () => {
    await expect(service.listImports({ ...actor, role: 'member' })).rejects.toThrow(
      'Only organisation owners and administrators',
    );
    expect(db.query).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects unsupported file extensions', async () => {
    const file = { buffer: Buffer.from('x'), originalname: 'finance.xls', size: 1 } as Express.Multer.File;
    await expect(service.upload(file, 'transactions', actor)).rejects.toThrow(
      'Only .csv and .xlsx files are supported',
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('stages a workbook, its headers and raw rows without committing financial facts', async () => {
    const file = makeFile([
      ['Date', 'Type', 'Amount', 'Currency'],
      ['2026-01-01', 'revenue', 125.5, 'USD'],
    ]);
    const result = await service.upload(file, 'transactions', actor);
    expect(result.status).toBe('mapping_required');
    expect(result.rowCount).toBe(1);
    expect(result.headers).toEqual(['Date', 'Type', 'Amount', 'Currency']);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    const statements = client.query.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(statements.some((sql: string) => sql.includes('INSERT INTO executive_imports'))).toBe(true);
    expect(statements.some((sql: string) => sql.includes('INSERT INTO executive_import_rows'))).toBe(true);
    expect(statements.some((sql: string) => sql.includes('INSERT INTO executive_financial_transactions'))).toBe(false);
  });

  it('proposes deduplicated financial candidates only from explicit amount/date evidence', async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: '44444444-4444-4444-8444-444444444444' }] });

    const result = await service.proposeFinancialCandidates({
      organizationId: actor.organizationId,
      documentId: '55555555-5555-4555-8555-555555555555',
      teamId: null,
      actorId: actor.userId,
      chunks: [{
        chunkId: '66666666-6666-4666-8666-666666666666',
        content: 'Revenue received on 2026-01-03 was USD 250.50.',
      }],
    });

    expect(result).toEqual({ created: 1 });
    expect(client.query.mock.calls[0][0]).toContain('INSERT INTO executive_financial_candidates');
    expect(client.query.mock.calls[0][1]).toContain('revenue');
    expect(client.query.mock.calls[0][1]).toContain('250.50');
    expect(publisher.append).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        eventType: 'financial.candidate_proposed',
        payload: expect.objectContaining({ status: 'pending', currency: 'USD' }),
      }),
      ['luie.legacy-domain-bridge'],
    );
  });

  it('does not propose financial candidates from ambiguous evidence', async () => {
    const result = await service.proposeFinancialCandidates({
      organizationId: actor.organizationId,
      documentId: '55555555-5555-4555-8555-555555555555',
      teamId: null,
      actorId: actor.userId,
      chunks: [{
        chunkId: '66666666-6666-4666-8666-666666666666',
        content: 'Revenue may exceed USD 250.50 on 2026-01-03 based on a forecast.',
      }],
    });

    expect(result).toEqual({ created: 0 });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('requires a dataset type from the supported catalogue', async () => {
    const file = { buffer: Buffer.from('x'), originalname: 'finance.csv', size: 1 } as Express.Multer.File;
    await expect(service.upload(file, 'customers', actor)).rejects.toThrow(
      'datasetType must be transactions, contracts or pipeline',
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects an incomplete column mapping before changing staged rows', async () => {
    client.query.mockResolvedValueOnce({ rows: [{
      id: 'import-1', organization_id: actor.organizationId,
      dataset_type: 'transactions', status: 'mapping_required',
      source_headers: ['Date', 'Amount'], column_mapping: {}, row_count: 1,
    }] });

    await expect(service.validateImport('import-1', { transaction_date: 'Date' }, actor))
      .rejects.toThrow("required field 'transaction_type'");
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('validates and normalizes rows using the mapped columns', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{
        id: 'import-1', organization_id: actor.organizationId,
        dataset_type: 'transactions', status: 'mapping_required',
        source_headers: ['Date', 'Type', 'Amount', 'Currency', 'Reference'],
        column_mapping: {}, row_count: 1,
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'row-1', row_number: 2,
        raw_data: { Date: '2026-01-03', Type: 'revenue', Amount: 250, Currency: 'usd', Reference: 'INV-1' },
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await service.validateImport('import-1', {
      transaction_date: 'Date', transaction_type: 'Type', amount: 'Amount',
      currency: 'Currency', external_reference: 'Reference',
    }, actor);

    expect(result).toMatchObject({ status: 'validated', rowCount: 1, validRowCount: 1, invalidRowCount: 0, duplicateRowCount: 0 });
    const updates = client.query.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(updates.some((sql: string) => sql.includes('UPDATE executive_import_rows'))).toBe(true);
    expect(updates.some((sql: string) => sql.includes("SET status = 'validated'"))).toBe(true);
  });

  it('requires explicit confirmation before committing a partial import', async () => {
    client.query.mockResolvedValueOnce({ rows: [{
      id: 'import-1', organization_id: actor.organizationId,
      dataset_type: 'transactions', status: 'validated',
      row_count: 2, valid_row_count: 1, invalid_row_count: 1, duplicate_row_count: 0,
    }] });

    await expect(service.commitImport('import-1', false, actor)).rejects.toThrow('confirmPartial=true');
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('commits valid transaction rows atomically and records an audit event', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{
        id: 'import-1', organization_id: actor.organizationId,
        dataset_type: 'transactions', status: 'validated',
        row_count: 1, valid_row_count: 1, invalid_row_count: 0, duplicate_row_count: 0,
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'row-1', row_number: 2,
        normalized_data: {
          transaction_date: '2026-01-03', transaction_type: 'revenue',
          amount: '250', currency: 'USD', customer_key: null,
          external_reference: 'INV-1', description: null,
        },
        fingerprint: 'a'.repeat(64),
      }] })
      .mockResolvedValueOnce({ rows: [{ committed_rows: 1 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await service.commitImport('import-1', false, actor);
    expect(result).toMatchObject({ status: 'committed', alreadyCommitted: false, committedRows: 1 });
    const sql = client.query.mock.calls.map((call: unknown[]) => String(call[0]));
    const insert = sql.find((query: string) => query.includes('INSERT INTO executive_financial_transactions'));
    expect(insert).toBeDefined();
    // Postgres will not assign JSONB text to a DATE column without an explicit cast.
    expect(insert).toContain("(r.normalized_data->>'transaction_date')::date");
    expect(insert).toContain("(r.normalized_data->>'amount')::numeric");
    expect(sql.some((query: string) => query.includes("'import_committed'"))).toBe(true);
    expect(publisher.append).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        eventType: 'financial.import_committed',
        aggregateId: 'import-1',
        payload: expect.objectContaining({ committedRows: 1, datasetType: 'transactions' }),
      }),
      ['luie.legacy-domain-bridge'],
    );
  });

  it('returns an idempotent result when an import has already been committed', async () => {
    client.query.mockResolvedValueOnce({ rows: [{
      id: 'import-1', organization_id: actor.organizationId,
      dataset_type: 'transactions', status: 'committed',
      row_count: 1, valid_row_count: 1, invalid_row_count: 0, duplicate_row_count: 0,
    }] });

    await expect(service.commitImport('import-1', false, actor)).resolves.toMatchObject({
      status: 'committed', alreadyCommitted: true, committedRows: 1,
    });
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});