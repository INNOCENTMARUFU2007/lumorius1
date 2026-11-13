import { ExecutivePdfReport, ExecutivePdfService } from './executive-pdf.service';

describe('ExecutivePdfService', () => {
  let service: ExecutivePdfService;

  const baseReport = (): ExecutivePdfReport => ({
    organizationId: '22222222-2222-4222-8222-222222222222',
    organizationName: 'Lumorius Test Organisation',
    reportTitle: 'Executive Performance Report',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    generatedAt: '2026-11-05T12:00:00.000Z',
    executiveSummary: 'This report contains verified operational activity and clearly labelled financial availability.',
    metrics: [
      {
        key: 'tasks_completed',
        label: 'Tasks completed',
        category: 'Operations',
        status: 'actual',
        value: 42,
        unit: 'tasks',
        targetValue: 50,
        formula: 'Count of tasks with completed_at inside the reporting period.',
        sourceLabels: ['tasks'],
        sampleSize: 42,
        trend: [{ label: 'W1', value: 8 }, { label: 'W2', value: 12 }, { label: 'W3', value: 10 }, { label: 'W4', value: 12 }],
      },
      {
        key: 'gross_margin',
        label: 'Gross margin',
        status: 'estimated',
        value: 36.5,
        unit: '%',
        formula: 'Estimated from supplied revenue and cost assumptions.',
        note: 'Estimate; confirm source completeness before external distribution.',
      },
      {
        key: 'customer_churn',
        label: 'Customer churn',
        status: 'unavailable',
        value: null,
        unit: '%',
        formula: 'Requires verified recurring customer contract history.',
      },
    ],
    sections: [{ title: 'Management commentary', body: 'Operational performance should be interpreted alongside data freshness.', items: ['Review overdue delivery commitments.'] }],
    sources: [{ sourceType: 'Operational database', sourceName: 'Tasks', sourceId: 'tasks', recordCount: 42, periodStart: '2026-10-01', periodEnd: '2026-10-31' }],
    assumptions: ['No foreign-exchange conversion has been applied.'],
  });

  beforeEach(() => {
    service = new ExecutivePdfService();
  });

  it('generates a valid non-empty PDF buffer with actual, estimated and unavailable metric states', async () => {
    const pdf = await service.generate(baseReport());
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1500);
  });

  it('does not append a blank page while drawing page numbers', async () => {
    const report = baseReport();
    report.metrics = [];
    report.sections = [];
    report.sources = [];
    report.assumptions = [];
    report.executiveSummary = 'Minimal report used to verify footer pagination.';

    const pdf = await service.generate(report);
    const pageObjects = pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? [];

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pageObjects).toHaveLength(1);
  });
  it('generates multi-page reports with page-number metadata', async () => {
    const report = baseReport();
    report.metrics = Array.from({ length: 45 }, (_, index) => ({
      key: `metric_${index}`,
      label: `Metric ${index + 1}`,
      status: 'actual' as const,
      value: index * 2,
      formula: 'A deliberately repeated calculation definition used to exercise line wrapping and page breaks in a multi-page executive report.',
      sourceLabels: ['verified operational source'],
    }));
    const pdf = await service.generate(report);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(8000);
  });

  it('rejects a non-null value labelled unavailable', async () => {
    const report = baseReport();
    report.metrics = [{ key: 'bad_metric', label: 'Bad metric', status: 'unavailable', value: 10 }];
    await expect(service.generate(report)).rejects.toThrow('must have a null value');
  });

  it('rejects a null value labelled actual', async () => {
    const report = baseReport();
    report.metrics = [{ key: 'bad_metric', label: 'Bad metric', status: 'actual', value: null }];
    await expect(service.generate(report)).rejects.toThrow('must have a value');
  });

  it('rejects non-finite metric and target values', async () => {
    const report = baseReport();
    report.metrics = [{ key: 'bad_metric', label: 'Bad metric', status: 'actual', value: Number.NaN }];
    await expect(service.generate(report)).rejects.toThrow('finite numeric value');

    report.metrics = [{ key: 'bad_target', label: 'Bad target', status: 'actual', value: 1, targetValue: Number.POSITIVE_INFINITY }];
    await expect(service.generate(report)).rejects.toThrow('target must be finite');
  });

  it('rejects invalid reporting periods and oversized metric collections', async () => {
    const report = baseReport();
    report.periodStart = '2026-11-01';
    report.periodEnd = '2026-10-01';
    await expect(service.generate(report)).rejects.toThrow('must not precede');

    report.periodStart = '2026-10-01';
    report.periodEnd = '2026-10-31';
    report.metrics = Array.from({ length: 151 }, (_, index) => ({
      key: `metric_${index}`, label: `Metric ${index}`, status: 'actual' as const, value: index,
    }));
    await expect(service.generate(report)).rejects.toThrow('at most 150 metrics');
  });
});
