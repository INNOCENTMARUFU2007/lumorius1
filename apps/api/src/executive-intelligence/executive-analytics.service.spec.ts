import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ExecutiveAnalyticsService } from './executive-analytics.service';
import {
  calculateTargetAssessment,
  escapeCsvField,
  normalizeMonthlyRecurringAmount,
} from './executive-analytics.service';

describe('ExecutiveAnalyticsService calculation helpers', () => {
  it('rejects non-admin dashboard access before opening a database transaction', async () => {
    const db = { transaction: jest.fn() } as any;
    const service = new ExecutiveAnalyticsService(db);
    await expect(service.getDashboard({ organizationId: 'org-1', userId: 'user-1', role: 'member' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects malformed reporting dates before opening a database transaction', async () => {
    const db = { transaction: jest.fn() } as any;
    const service = new ExecutiveAnalyticsService(db);
    await expect(service.getDashboard(
      { organizationId: 'org-1', userId: 'user-1', role: 'owner' }, '2026-02-30', '2026-03-01',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });
  describe('normalizeMonthlyRecurringAmount', () => {
    it('keeps monthly contract amounts unchanged', () => {
      expect(normalizeMonthlyRecurringAmount(120, 'monthly')).toBe(120);
    });
    it('normalizes annual contracts to one twelfth', () => {
      expect(normalizeMonthlyRecurringAmount(1200, 'annual')).toBe(100);
    });
    it('normalizes quarterly contracts to one third', () => {
      expect(normalizeMonthlyRecurringAmount(300, 'quarterly')).toBe(100);
    });
    it('normalizes weekly contracts using 52 weeks per year', () => {
      expect(normalizeMonthlyRecurringAmount(12, 'weekly')).toBe(52);
    });
    it('rejects unknown intervals and non-positive amounts', () => {
      expect(normalizeMonthlyRecurringAmount(100, 'daily')).toBeNull();
      expect(normalizeMonthlyRecurringAmount(0, 'monthly')).toBeNull();
      expect(normalizeMonthlyRecurringAmount(Number.NaN, 'monthly')).toBeNull();
    });
  });

  describe('calculateTargetAssessment', () => {
    it('marks a higher-is-better metric on target when it reaches the goal', () => {
      expect(calculateTargetAssessment(110, 100, 'higher_is_better')).toEqual({ met: true, progressPct: 110, gapPct: 0 });
    });
    it('calculates the gap for a higher-is-better metric below target', () => {
      expect(calculateTargetAssessment(80, 100, 'higher_is_better')).toEqual({ met: false, progressPct: 80, gapPct: 20 });
    });
    it('marks a lower-is-better metric on target when it stays below the goal', () => {
      expect(calculateTargetAssessment(8, 10, 'lower_is_better')).toEqual({ met: true, progressPct: 125, gapPct: 0 });
    });
    it('calculates the gap for a lower-is-better metric above target', () => {
      expect(calculateTargetAssessment(12, 10, 'lower_is_better')).toEqual({ met: false, progressPct: 83.33333333333334, gapPct: 20 });
    });
    it('handles a zero target without dividing by zero', () => {
      expect(calculateTargetAssessment(0, 0, 'higher_is_better').met).toBe(true);
      expect(calculateTargetAssessment(1, 0, 'lower_is_better')).toEqual({ met: false, progressPct: null, gapPct: null });
    });
  });

  it('rejects future reporting periods before opening a database transaction', async () => {
    const db = { transaction: jest.fn() } as any;
    const service = new ExecutiveAnalyticsService(db);
    await expect(service.getDashboard(
      { organizationId: 'org-1', userId: 'user-1', role: 'owner' }, '2026-01-01', '2999-01-01',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('requires a currency for currency-scoped MRR growth targets', async () => {
    const db = { transaction: jest.fn() } as any;
    const service = new ExecutiveAnalyticsService(db);
    await expect(service.createTarget({
      metricKey: 'mrr_growth_pct', unit: '%', targetPeriod: 'monthly',
      direction: 'higher_is_better', periodStart: '2026-01-01', periodEnd: '2026-01-31', targetValue: 10,
    }, { organizationId: 'org-1', userId: 'user-1', role: 'owner' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects currency mismatches for financial targets before opening a transaction', async () => {
    const db = { transaction: jest.fn() } as any;
    const service = new ExecutiveAnalyticsService(db);
    await expect(service.createTarget({
      metricKey: 'revenue', unit: 'tasks', currency: 'USD', targetPeriod: 'monthly',
      direction: 'higher_is_better', periodStart: '2026-01-01', periodEnd: '2026-01-31', targetValue: 100,
    }, { organizationId: 'org-1', userId: 'user-1', role: 'owner' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('keeps CSV target progress and alert columns aligned with their headers', () => {
    const service = new ExecutiveAnalyticsService({} as any);
    const csv = service.exportCsv({
      organizationId: 'org-1', organizationName: 'Acme', reportTitle: 'Test',
      periodStart: '2026-01-01', periodEnd: '2026-01-31',
      metrics: [{ key: 'tasks_completed', metricKey: 'tasks_completed', label: 'Tasks completed',
        status: 'actual', value: 9, unit: 'tasks', targetProgressPct: 90, targetStatus: 'behind' }],
      alerts: [],
    } as any);
    const [header, row] = csv.replace(/^\uFEFF/, '').split('\r\n');
    const headers = header.split(',');
    const values = row.split(',');
    expect(values[headers.indexOf('target_progress_pct')]).toBe('\"90\"');
    expect(values[headers.indexOf('alert')]).toBe('\"false\"');
    expect(values[headers.indexOf('target_status')]).toBe('\"behind\"');
  });

  describe('escapeCsvField', () => {
    it('quotes and escapes commas and quote characters', () => {
      expect(escapeCsvField('Acme, "North"')).toBe('"Acme, ""North"""');
    });
    it('neutralizes spreadsheet formula injection', () => {
      expect(escapeCsvField('=HYPERLINK("https://bad.example")')).toBe('"\'=HYPERLINK(""https://bad.example"")"');
      expect(escapeCsvField(' +cmd')).toBe('"\' +cmd"');
    });
    it('serializes null as an empty field', () => {
      expect(escapeCsvField(null)).toBe('""');
    });
  });
});