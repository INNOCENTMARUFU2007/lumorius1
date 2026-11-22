import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type CashObservation = { month:string; opening:number; closing:number; inflows:number; outflows:number };
/** Money in and out for one month, from committed transactions (month = YYYY-MM-01). */
export type MonthlyFlow = { month:string; inflows:number; outflows:number };
export type ForecastPoint = { period:string; days:number; lower:number; base:number; upper:number };
export type CashForecastResult = {
  currency:string;
  /** cash_balances: reconciled monthly balances; transactions: running net movement from transactions (not a bank balance). */
  basis:'cash_balances' | 'transactions';
  latest:{ month:string; closing:number };
  stale:boolean;
  usableMonths:number;
  activeMonths:number;
  points:ForecastPoint[];
  backtest:{ period:string; forecast:number; actual:number; absoluteError:number }[];
  /** Observed position per month, oldest first: closing balance, or running net movement. */
  history:{ period:string; value:number; net:number }[];
};

const addMonths = (month:string,count:number) => {
  const date=new Date(month+'T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth()+count);
  return date.toISOString().slice(0,10);
};
const fixed = (value:number) => Math.round(value*10_000)/10_000;
const median = (sorted:number[]) => fixed((sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2);

export function cashForecast(history:CashObservation[],today=new Date().toISOString().slice(0,10)) {
  const sorted=[...history].sort((a,b)=>b.month.localeCompare(a.month));
  const latest=sorted[0];
  if (!latest) return null;
  const usable=[latest];
  for (const prior of sorted.slice(1)) {
    const next=usable[usable.length-1];
    if (addMonths(prior.month,1)!==next.month || fixed(prior.closing)!==fixed(next.opening)) break;
    usable.push(prior);
  }
  const stale=addMonths(latest.month,2)<today.slice(0,7)+'-01';
  const points:ForecastPoint[]=[];
  if (usable.length>=3 && !stale) {
    const deltas=usable.slice(0,12).map(row=>fixed(row.inflows-row.outflows)).sort((a,b)=>a-b);
    const mid=median(deltas);
    for (const count of usable.length>=12 ? [1,2,3,12] : [1,2,3]) points.push({
      period:addMonths(latest.month,count).slice(0,7), days:count===12?365:count*30,
      lower:fixed(latest.closing+count*deltas[0]),base:fixed(latest.closing+count*mid),upper:fixed(latest.closing+count*deltas[deltas.length-1]),
    });
  }
  const observed=[...usable].reverse();
  const backtest=observed.slice(3).map((row,index)=>{
    const prior=observed.slice(index,index+3);
    const delta=prior.map(point=>fixed(point.inflows-point.outflows)).sort((a,b)=>a-b)[1];
    const predicted=fixed(prior.at(-1)!.closing+delta);
    return { period:row.month.slice(0,7),forecast:predicted,actual:row.closing,absoluteError:fixed(Math.abs(row.closing-predicted)) };
  });
  return {
    basis:'cash_balances' as const, latest, stale, usableMonths:usable.length, activeMonths:usable.length, points, backtest:backtest.slice(-12),
    history:observed.map(row=>({ period:row.month.slice(0,7), value:fixed(row.closing), net:fixed(row.inflows-row.outflows) })),
  };
}

/**
 * Forecast from committed transactions when no cash balances are imported. It tracks the
 * running net movement (money in minus money out) since the first month with records and
 * extends it with the lowest, median and highest monthly movement of the last 12 months.
 * Needs at least three months of history, two of them with records, and recent activity.
 */
export function transactionCashForecast(flows:MonthlyFlow[],today=new Date().toISOString().slice(0,10)) {
  if (!flows.length) return null;
  const current=today.slice(0,7)+'-01';
  const byMonth=new Map(flows.map(flow=>[flow.month.slice(0,7)+'-01',flow]));
  const first=[...byMonth.keys()].sort()[0];
  if (first>current) return null;
  const months:MonthlyFlow[]=[];
  for (let month=first; month<=current; month=addMonths(month,1)) months.push(byMonth.get(month) ?? { month, inflows:0, outflows:0 });
  const window=months.slice(-24);
  let running=0;
  const history=window.map(row=>{
    const net=fixed(row.inflows-row.outflows);
    running=fixed(running+net);
    return { period:row.month.slice(0,7), value:running, net };
  });
  const active=window.filter(row=>row.inflows||row.outflows);
  if (!active.length) return null;
  const lastActive=active[active.length-1].month;
  const stale=addMonths(lastActive,3)<current;
  const points:ForecastPoint[]=[];
  if (window.length>=3 && active.length>=2 && !stale) {
    const deltas=window.slice(-12).map(row=>fixed(row.inflows-row.outflows)).sort((a,b)=>a-b);
    const mid=median(deltas);
    for (const count of window.length>=12 ? [1,2,3,12] : [1,2,3]) points.push({
      period:addMonths(current,count).slice(0,7), days:count===12?365:count*30,
      lower:fixed(running+count*deltas[0]), base:fixed(running+count*mid), upper:fixed(running+count*deltas[deltas.length-1]),
    });
  }
  return {
    basis:'transactions' as const, latest:{ month:current, closing:running }, stale,
    usableMonths:window.length, activeMonths:active.length, points, backtest:[], history,
  };
}

@Injectable()
export class CashForecastService {
  constructor(private readonly db:DatabaseService) {}
  async forWorkspace(org:string):Promise<CashForecastResult[]> {
    const [balances,flows]=await Promise.all([
      this.db.query<{ currency:string; data:CashObservation[] }>(`WITH data AS (
        SELECT r.normalized_data d,r.normalized_data->>'currency' c
        FROM executive_import_rows r JOIN executive_imports i ON i.organization_id=r.organization_id AND i.id=r.import_id
        WHERE i.organization_id=$1 AND i.dataset_type='cash' AND i.status='committed'
        AND r.validation_status='committed' AND r.normalized_data ? 'cash_key'
        AND (r.normalized_data->>'report_month')::date >= CURRENT_DATE - interval '25 months'
      ) SELECT c AS currency,jsonb_agg(jsonb_build_object('month',d->>'report_month','opening',d->'opening_balance','closing',d->'closing_balance',
        'inflows',d->'inflows','outflows',d->'outflows') ORDER BY d->>'report_month' DESC) AS data
        FROM data GROUP BY c ORDER BY c LIMIT 20`,[org]),
      this.db.query<{ currency:string; month:string; inflows:string|number; outflows:string|number }>(
        `SELECT BTRIM(currency) AS currency, DATE_TRUNC('month', transaction_date)::date::text AS month,
                COALESCE(SUM(amount) FILTER (WHERE transaction_type IN ('revenue','other_income')),0)::numeric AS inflows,
                COALESCE(SUM(amount) FILTER (WHERE transaction_type NOT IN ('revenue','other_income')),0)::numeric AS outflows
           FROM executive_financial_transactions
          WHERE organization_id=$1 AND transaction_date <= CURRENT_DATE
            AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE) - interval '35 months'
          GROUP BY 1,2 ORDER BY 1,2`,[org]),
    ]);
    const results:CashForecastResult[]=balances.rows.flatMap(row=>{
      const scenario=cashForecast(row.data);
      return scenario?[{ currency:String(row.currency).trim(),...scenario }]:[];
    });
    const covered=new Set(results.map(row=>row.currency));
    const byCurrency=new Map<string,MonthlyFlow[]>();
    for (const row of flows.rows) {
      if (covered.has(row.currency)) continue;
      byCurrency.set(row.currency,[...(byCurrency.get(row.currency) ?? []),{ month:row.month, inflows:Number(row.inflows), outflows:Number(row.outflows) }]);
    }
    for (const [currency,rows] of byCurrency) {
      const scenario=transactionCashForecast(rows);
      if (scenario) results.push({ currency,...scenario });
    }
    return results.sort((a,b)=>a.currency.localeCompare(b.currency)).slice(0,20);
  }
}
