import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ExecutiveAnalyticsService } from './executive-analytics.service';
import {
  buildMonthlySeries,
  calculateTargetAssessment,
  escapeCsvField,
  metricTrendsFromSeries,
  monthlyTrendWindow,
  normalizeMonthlyRecurringAmount,
} from './executive-analytics.service';

describe('monthly trend helpers', () => {
  it('covers the 12 months ending at the period end for a short period', () => {
    const window = monthlyTrendWindow('2026-10-24', '2026-11-22');
    expect(window.months).toHaveLength(12);
    expect(window.months[0]).toBe('2025-12');
    expect(window.months[11]).toBe('2026-11');
    expect(window.start).toBe('2025-12-01');
    // Month ends, but never past the period end.
    expect(window.snapshotDates[0]).toBe('2025-12-31');
    expect(window.snapshotDates[2]).toBe('2026-02-28');
    expect(window.snapshotDates[11]).toBe('2026-11-22');
  });

  it('uses the whole period when longer than 12 months, capped at 36', () => {
    expect(monthlyTrendWindow('2025-01-15', '2026-11-22').months).toHaveLength(23);
    const long = monthlyTrendWindow('2018-01-01', '2026-11-22');
    expect(long.months).toHaveLength(36);
    expect(long.months[0]).toBe('2023-12');
  });

  it('zero-fills months, keeps currencies apart and marks which types have records', () => {
    const months = ['2026-09', '2026-10', '2026-11'];
    const series = buildMonthlySeries(months, [
      { currency: 'USD', month: '2026-10', transaction_type: 'revenue', total_amount: '1000.50', record_count: 2 },
      { currency: 'USD', month: '2026-11', transaction_type: 'cost_of_goods_sold', total_amount: '400', record_count: 3 },
      { currency: 'EUR ', month: '2026-11', transaction_type: 'revenue', total_amount: '90', record_count: 1 },
      { currency: 'USD', month: '2026-11', transaction_type: 'not_a_type', total_amount: '5', record_count: 1 },
    ], []);
    expect(series.map((s) => s.currency)).toEqual(['EUR', 'USD']);
    const usd = series[1];
    expect(usd.typesPresent).toEqual(['revenue', 'cost_of_goods_sold']);
    expect(usd.points.map((p) => p.revenue)).toEqual([0, 1000.5, 0]);
    expect(usd.points.map((p) => p.recordCount)).toEqual([0, 2, 3]);
    expect(usd.points.every((p) => p.mrr === null)).toBe(true);
  });

  it('fills MRR per month end, using zero for months with no active contracts', () => {
    const series = buildMonthlySeries(['2026-10', '2026-11'], [], [
      { snapshot_date: '2026-11-22', currency: 'USD', mrr: '250' },
    ]);
    expect(series[0].points.map((p) => p.mrr)).toEqual([0, 250]);
    const trends = metricTrendsFromSeries(series[0]);
    expect(trends.arr.map((p) => p.value)).toEqual([0, 3000]);
  });

  it('gives derived metrics a trend only when their inputs exist', () => {
    const [onlyRevenue] = buildMonthlySeries(['2026-11'], [
      { currency: 'USD', month: '2026-11', transaction_type: 'revenue', total_amount: '100', record_count: 1 },
      { currency: 'USD', month: '2026-11', transaction_type: 'refund', total_amount: '10', record_count: 1 },
    ], []);
    const revenueTrends = metricTrendsFromSeries(onlyRevenue);
    expect(revenueTrends.net_revenue[0].value).toBe(90);
    expect(revenueTrends.gross_profit).toBeUndefined();
    expect(revenueTrends.mrr).toBeUndefined();

    const [full] = buildMonthlySeries(['2026-11'], [
      { currency: 'USD', month: '2026-11', transaction_type: 'revenue', total_amount: '100', record_count: 1 },
      { currency: 'USD', month: '2026-11', transaction_type: 'cost_of_goods_sold', total_amount: '30', record_count: 1 },
      { currency: 'USD', month: '2026-11', transaction_type: 'operating_expense', total_amount: '50.1', record_count: 1 },
      { currency: 'USD', month: '2026-11', transaction_type: 'acquisition_cost', total_amount: '20.2', record_count: 1 },
    ], []);
    const fullTrends = metricTrendsFromSeries(full);
    expect(fullTrends.gross_profit[0].value).toBe(70);
    expect(fullTrends.operating_result[0].value).toBe(-0.3);
  });
});

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