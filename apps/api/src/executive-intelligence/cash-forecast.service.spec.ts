import { cashForecast, CashObservation, transactionCashForecast } from './cash-forecast.service';

describe('transaction-based cash forecast', () => {
  it('tracks running net movement and fans out from the lowest, median and highest month', () => {
    const result = transactionCashForecast([
      { month: '2026-06-01', inflows: 0, outflows: 7500 },
      { month: '2026-11-01', inflows: 25175, outflows: 14616.5 },
    ], '2026-11-22');
    expect(result?.basis).toBe('transactions');
    expect(result?.history.map((p) => p.period)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(result?.latest.closing).toBe(3058.5);
    // Monthly movements: -7500, 0, 0, 0, 0, 10558.5 -> median 0.
    expect(result?.points[0]).toEqual({ period: '2026-12', days: 30, lower: -4441.5, base: 3058.5, upper: 13617 });
    expect(result?.activeMonths).toBe(2);
  });

  it('withholds projections for a single active month or stale records', () => {
    expect(transactionCashForecast([{ month: '2026-11-01', inflows: 10, outflows: 2 }], '2026-11-22')?.points).toEqual([]);
    expect(transactionCashForecast([
      { month: '2026-01-01', inflows: 10, outflows: 2 },
      { month: '2026-02-01', inflows: 10, outflows: 2 },
    ], '2026-11-22')?.stale).toBe(true);
    expect(transactionCashForecast([])).toBeNull();
  });
});
const rows:CashObservation[] = [
  {month:'2026-08-01',opening:100,closing:110,inflows:15,outflows:5},
  {month:'2026-09-01',opening:110,closing:106,inflows:1,outflows:5},
  {month:'2026-10-01',opening:106,closing:110,inflows:10,outflows:6},
  {month:'2026-11-01',opening:110,closing:114,inflows:10,outflows:6},
];

describe('cash forecast',()=>{
  it('anchors scenarios to reconciled history and compares past forecasts to actuals',()=>{
    const result=cashForecast(rows,'2026-12-02');
    expect(result?.points[0]).toEqual({period:'2026-12',days:30,lower:110,base:118,upper:124});
    expect(result?.points).toHaveLength(3);
    expect(result?.backtest).toEqual([{period:'2026-11',forecast:114,actual:114,absoluteError:0}]);
  });
  it('withholds projections for stale, disconnected or missing history',()=>{
    expect(cashForecast(rows,'2027-03-01')?.points).toEqual([]);
    expect(cashForecast([rows[0],rows[2],rows[3]],'2026-12-02')?.points).toEqual([]);
    expect(cashForecast([])).toBeNull();
  });
});
