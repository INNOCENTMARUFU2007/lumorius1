import { KEY_RESULT_SOURCES, quarterPeriod, sourceValue } from './key-result-sources';

describe('key result data sources', () => {
  it('measures a goal quarter from its first day to today, or to the quarter end once it has passed', () => {
    expect(quarterPeriod('Q4', 2026, '2026-11-22')).toEqual({ start: '2026-10-01', end: '2026-11-22', quarterEnd: '2026-12-31' });
    expect(quarterPeriod('Q1', 2026, '2026-11-22')).toEqual({ start: '2026-01-01', end: '2026-03-31', quarterEnd: '2026-03-31' });
    expect(quarterPeriod('Q1', 2027, '2026-11-22')).toBeNull();
    expect(quarterPeriod('Q9', 2026)).toBeNull();
  });

  it('reads the matching metric and currency, and reports missing data as null', () => {
    const metrics = [
      { metricKey: 'mrr', currency: 'USD', status: 'actual', value: 4200.456 },
      { metricKey: 'mrr', currency: 'EUR', status: 'actual', value: 900 },
      { metricKey: 'revenue', currency: 'USD', status: 'unavailable', value: null },
      { metricKey: 'tasks_completed', status: 'actual', value: '12' },
    ];
    expect(sourceValue(metrics, KEY_RESULT_SOURCES['ei:mrr'], 'USD')).toBe(4200.46);
    expect(sourceValue(metrics, KEY_RESULT_SOURCES['ei:mrr'], 'GBP')).toBeNull();
    expect(sourceValue(metrics, KEY_RESULT_SOURCES['ei:revenue'], 'USD')).toBeNull();
    expect(sourceValue(metrics, KEY_RESULT_SOURCES['workspace:tasks_completed'], null)).toBe(12);
  });

  it('marks costs as lower-is-better and MRR as a snapshot', () => {
    expect(KEY_RESULT_SOURCES['ei:operating_expense'].lowerIsBetter).toBe(true);
    expect(KEY_RESULT_SOURCES['ei:mrr'].kind).toBe('snapshot');
    expect(KEY_RESULT_SOURCES['workspace:tasks_completed'].financial).toBe(false);
  });
});
