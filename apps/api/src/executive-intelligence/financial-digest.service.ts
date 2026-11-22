import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CashForecastService } from './cash-forecast.service';

const INFLOWS = new Set(['revenue', 'other_income']);
const LABELS: Record<string, string> = {
  revenue: 'Revenue',
  other_income: 'Other income',
  refund: 'Refunds',
  cost_of_goods_sold: 'Cost of goods sold',
  operating_expense: 'Operating expenses',
  acquisition_cost: 'Customer acquisition spend',
  tax: 'Tax',
  capital_expenditure: 'Capital expenditure',
};
const TYPE_ORDER = Object.keys(LABELS);

/** Questions about money: profit, costs, revenue, cash, pricing, growth and similar. */
export const FINANCE_INTENT = /\b(profit\w*|margin\w*|revenue\w*|sales|income|earn\w*|cost\w*|expens\w*|spend\w*|spent|budget\w*|cash\w*|burn|runway|pric\w*|financ\w*|money|cogs|opex|overhead\w*|saving\w*|ebitda|forecast\w*|mrr|arr|churn\w*|pipeline|grow\w*|roi|invest\w*|loss\w*|debt|invoice\w*|payroll|salar\w*|valuation|cac|ltv|unit economics|cut\w*|efficien\w*)\b/i;

export function isFinanceQuestion(text: string): boolean {
  return FINANCE_INTENT.test(String(text ?? ''));
}

export type DigestSection = { key: string; title: string; text: string };
export type FinancialDigest = {
  windowStart: string;
  windowEnd: string;
  currencies: string[];
  sections: DigestSection[];
  /** Compact plain-text digest for AI prompts. */
  text: string;
};

type Num = string | number | null;
const n = (value: Num) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : 'n/a');
const monthName = (month: string) => new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Group a transaction description into a cost line, e.g. "Hotel - Dubai trip - A Person" -> "Hotel". */
export function costLine(description: string | null): string {
  const text = String(description ?? '').trim();
  if (!text) return '(no description)';
  const head = text.split(/\s[-–—|:]\s|[,;(]/)[0].trim() || text;
  return head.length > 50 ? `${head.slice(0, 47)}…` : head;
}

@Injectable()
export class FinancialDigestService {
  constructor(
    private readonly db: DatabaseService,
    private readonly cash: CashForecastService,
  ) {}

  /**
   * Facts from committed financial records for the last 12 months (by currency, never
   * converted). Returns null when the workspace has no financial records at all.
   */
  async build(organizationId: string, today = new Date().toISOString().slice(0, 10)): Promise<FinancialDigest | null> {
    const end = today;
    const startDate = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    startDate.setUTCMonth(startDate.getUTCMonth() - 11);
    const start = startDate.toISOString().slice(0, 10);

    const [totals, monthly, outflowRows, customers, contracts, pipeline, targets, cash] = await Promise.all([
      this.db.query<{ currency: string; transaction_type: string; records: Num; total: Num; first_date: string; last_date: string }>(
        `SELECT BTRIM(currency) AS currency, transaction_type, COUNT(*)::int AS records, SUM(amount)::numeric AS total,
                MIN(transaction_date)::text AS first_date, MAX(transaction_date)::text AS last_date
           FROM executive_financial_transactions
          WHERE organization_id = $1 AND transaction_date BETWEEN $2::date AND $3::date
          GROUP BY 1, 2`,
        [organizationId, start, end],
      ),
      this.db.query<{ currency: string; month: string; inflows: Num; outflows: Num; revenue: Num; records: Num }>(
        `SELECT BTRIM(currency) AS currency, TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,
                COALESCE(SUM(amount) FILTER (WHERE transaction_type IN ('revenue','other_income')), 0)::numeric AS inflows,
                COALESCE(SUM(amount) FILTER (WHERE transaction_type NOT IN ('revenue','other_income')), 0)::numeric AS outflows,
                COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'revenue'), 0)::numeric AS revenue,
                COUNT(*)::int AS records
           FROM executive_financial_transactions
          WHERE organization_id = $1 AND transaction_date BETWEEN $2::date AND $3::date
          GROUP BY 1, 2 ORDER BY 1, 2`,
        [organizationId, start, end],
      ),
      this.db.query<{ currency: string; transaction_type: string; description: string | null; amount: Num }>(
        `SELECT BTRIM(currency) AS currency, transaction_type, description, amount
           FROM executive_financial_transactions
          WHERE organization_id = $1 AND transaction_date BETWEEN $2::date AND $3::date
            AND transaction_type NOT IN ('revenue','other_income')
          ORDER BY amount DESC LIMIT 5000`,
        [organizationId, start, end],
      ),
      this.db.query<{ currency: string; customer_key: string; total: Num }>(
        `SELECT BTRIM(currency) AS currency, customer_key, SUM(amount)::numeric AS total
           FROM executive_financial_transactions
          WHERE organization_id = $1 AND transaction_date BETWEEN $2::date AND $3::date
            AND transaction_type = 'revenue' AND NULLIF(BTRIM(customer_key), '') IS NOT NULL
          GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 50`,
        [organizationId, start, end],
      ),
      this.db.query<{ currency: string; contracts: Num; customers: Num; mrr: Num }>(
        `SELECT BTRIM(currency) AS currency, COUNT(*)::int AS contracts, COUNT(DISTINCT customer_key)::int AS customers,
                COALESCE(SUM(CASE billing_interval
                  WHEN 'weekly' THEN recurring_amount * 52 / 12 WHEN 'monthly' THEN recurring_amount
                  WHEN 'quarterly' THEN recurring_amount / 3 WHEN 'annual' THEN recurring_amount / 12 ELSE 0 END), 0)::numeric AS mrr
           FROM executive_customer_contracts
          WHERE organization_id = $1 AND status = 'active' AND start_date <= CURRENT_DATE
            AND (end_date IS NULL OR end_date >= CURRENT_DATE) AND (cancelled_at IS NULL OR cancelled_at > CURRENT_DATE)
          GROUP BY 1`,
        [organizationId],
      ),
      this.db.query<{ currency: string; open_count: Num; open_amount: Num; weighted: Num; won_90: Num; lost_90: Num }>(
        `SELECT BTRIM(currency) AS currency,
                COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
                COALESCE(SUM(amount) FILTER (WHERE status = 'open'), 0)::numeric AS open_amount,
                COALESCE(SUM(amount * probability) FILTER (WHERE status = 'open'), 0)::numeric AS weighted,
                COALESCE(SUM(amount) FILTER (WHERE status = 'won' AND closed_at >= CURRENT_DATE - 90), 0)::numeric AS won_90,
                COALESCE(SUM(amount) FILTER (WHERE status = 'lost' AND closed_at >= CURRENT_DATE - 90), 0)::numeric AS lost_90
           FROM executive_pipeline_opportunities WHERE organization_id = $1 GROUP BY 1`,
        [organizationId],
      ),
      this.db.query<{ metric_key: string; target_value: Num; currency: string | null; direction: string; period_start: string; period_end: string }>(
        `SELECT metric_key, target_value, NULLIF(BTRIM(currency::text), '') AS currency, direction,
                period_start::text, period_end::text
           FROM executive_metric_targets WHERE organization_id = $1
          ORDER BY period_end DESC, created_at DESC LIMIT 8`,
        [organizationId],
      ),
      this.cash.forWorkspace(organizationId).catch(() => []),
    ]);

    if (!totals.rows.length && !contracts.rows.length && !pipeline.rows.length) return null;

    const sections: DigestSection[] = [];
    const currencies = Array.from(new Set([
      ...totals.rows.map((row) => row.currency), ...contracts.rows.map((row) => row.currency), ...pipeline.rows.map((row) => row.currency),
    ])).filter(Boolean).sort();

    for (const currency of currencies) {
      const byType = new Map(totals.rows.filter((row) => row.currency === currency).map((row) => [row.transaction_type, row]));
      if (byType.size) {
        const value = (type: string) => n(byType.get(type)?.total ?? 0);
        const records = Array.from(byType.values()).reduce((sum, row) => sum + n(row.records), 0);
        const first = Array.from(byType.values()).map((row) => row.first_date).sort()[0];
        const last = Array.from(byType.values()).map((row) => row.last_date).sort().reverse()[0];
        const netRevenue = value('revenue') - value('refund');
        const gross = netRevenue - value('cost_of_goods_sold');
        const operating = gross - value('operating_expense') - value('acquisition_cost');
        const moneyIn = value('revenue') + value('other_income');
        const moneyOut = TYPE_ORDER.filter((type) => !INFLOWS.has(type)).reduce((sum, type) => sum + value(type), 0);
        const present = TYPE_ORDER.filter((type) => byType.has(type));
        sections.push({
          key: `finance:${currency}:totals`,
          title: `${currency} totals, ${monthName(start)} – ${monthName(end)}`,
          text: `${records} committed records from ${first} to ${last}. ` +
            present.map((type) => `${LABELS[type]} ${money(value(type))} (${n(byType.get(type)?.records)} record${n(byType.get(type)?.records) === 1 ? "" : "s"})`).join('; ') + '. ' +
            (byType.has('revenue')
              ? `Net revenue ${money(netRevenue)}. ` +
                (byType.has('cost_of_goods_sold') ? `Gross profit ${money(gross)} (gross margin ${pct(gross, netRevenue)}). ` : 'Gross margin unknown: no cost of goods sold recorded. ') +
                (byType.has('cost_of_goods_sold') && byType.has('operating_expense') ? `Operating result before tax and capex ${money(operating)} (operating margin ${pct(operating, netRevenue)}). ` : '')
              : 'No revenue recorded in this window, so margins cannot be calculated. ') +
            `All money in ${money(moneyIn)} minus all money out ${money(moneyOut)} = ${money(moneyIn - moneyOut)}.`,
        });
        if (netRevenue > 0) {
          sections.push({
            key: `finance:${currency}:structure`,
            title: `${currency} cost structure`,
            text: 'Each cost as a share of net revenue: ' +
              TYPE_ORDER.filter((type) => !INFLOWS.has(type) && type !== 'refund' && byType.has(type))
                .map((type) => `${LABELS[type]} ${pct(value(type), netRevenue)}`).join('; ') +
              `. Refunds are ${pct(value('refund'), value('revenue'))} of gross revenue.`,
          });
        }
      }

      const months = monthly.rows.filter((row) => row.currency === currency);
      if (months.length) {
        const last = months[months.length - 1];
        const previous = months.length > 1 ? months[months.length - 2] : null;
        sections.push({
          key: `finance:${currency}:monthly`,
          title: `${currency} month by month`,
          text: `Months with records (money in / money out / net): ` +
            months.map((row) => `${row.month}: ${money(n(row.inflows))} / ${money(n(row.outflows))} / ${money(n(row.inflows) - n(row.outflows))}`).join('; ') +
            `. ${months.length} of 12 months have records` +
            (previous ? `; latest recorded month ${last.month} revenue ${money(n(last.revenue))} vs ${previous.month} ${money(n(previous.revenue))}.` : '.') +
            (last.month === end.slice(0, 7) ? ` ${last.month} is month to date.` : ''),
        });
      }

      const lines = new Map<string, { type: string; total: number; records: number }>();
      let outTotal = 0;
      for (const row of outflowRows.rows.filter((item) => item.currency === currency)) {
        const key = `${row.transaction_type}|${costLine(row.description).toLowerCase()}`;
        const entry = lines.get(key) ?? { type: row.transaction_type, total: 0, records: 0 };
        entry.total += n(row.amount);
        entry.records += 1;
        lines.set(key, entry);
        outTotal += n(row.amount);
      }
      if (lines.size) {
        const label = (key: string) => {
          const line = key.split('|')[1];
          return line.charAt(0).toUpperCase() + line.slice(1);
        };
        const top = Array.from(lines.entries()).sort(([, a], [, b]) => b.total - a.total).slice(0, 8);
        sections.push({
          key: `finance:${currency}:cost-lines`,
          title: `${currency} largest cost lines`,
          text: 'Grouped by description: ' +
            top.map(([key, line]) => `${label(key)} (${LABELS[line.type] ?? line.type}) ${money(line.total)} across ${line.records} record${line.records === 1 ? '' : 's'}, ${pct(line.total, outTotal)} of all money out`).join('; ') + '.',
        });
      }

      const buyers = customers.rows.filter((row) => row.currency === currency);
      if (buyers.length) {
        const revenueTotal = n(byType.get('revenue')?.total ?? 0);
        sections.push({
          key: `finance:${currency}:customers`,
          title: `${currency} revenue by customer`,
          text: `${buyers.length} customers with tagged revenue. Top: ` +
            buyers.slice(0, 5).map((row) => `${row.customer_key} ${money(n(row.total))} (${pct(n(row.total), revenueTotal)})`).join('; ') +
            `. Top customer share ${pct(n(buyers[0].total), revenueTotal)}.`,
        });
      }

      const contract = contracts.rows.find((row) => row.currency === currency);
      if (contract) {
        sections.push({
          key: `finance:${currency}:recurring`,
          title: `${currency} recurring revenue`,
          text: `${n(contract.contracts)} active contracts from ${n(contract.customers)} customers. MRR ${money(n(contract.mrr))}, ARR run-rate ${money(n(contract.mrr) * 12)} (not recognised revenue).`,
        });
      }

      const deals = pipeline.rows.find((row) => row.currency === currency);
      if (deals) {
        sections.push({
          key: `finance:${currency}:pipeline`,
          title: `${currency} sales pipeline`,
          text: `${n(deals.open_count)} open opportunities worth ${money(n(deals.open_amount))} (probability-weighted ${money(n(deals.weighted))}). Last 90 days: won ${money(n(deals.won_90))}, lost ${money(n(deals.lost_90))}.`,
        });
      }

      const forecast = cash.find((row) => row.currency === currency);
      if (forecast) {
        const basis = forecast.basis === 'cash_balances' ? `reconciled closing balance ${money(forecast.latest.closing)}` : `running net movement from transactions ${money(forecast.latest.closing)} since ${forecast.history[0]?.period ?? 'the first record'} (not a bank balance)`;
        sections.push({
          key: `finance:${currency}:cash`,
          title: `${currency} cash outlook`,
          text: `Based on ${basis}. ` + (forecast.points.length
            ? 'Projection (downside / base / upside): ' + forecast.points.map((point) => `${point.period} ${money(point.lower)} / ${money(point.base)} / ${money(point.upper)}`).join('; ') + '.'
            : forecast.stale ? 'No projection: records are out of date.' : 'No projection yet: at least three months of history with two active months are needed.'),
        });
      }
    }

    if (targets.rows.length) {
      sections.push({
        key: 'finance:targets',
        title: 'KPI targets',
        text: targets.rows.map((row) => `${LABELS[row.metric_key] ?? row.metric_key.replace(/_/g, ' ')} ${row.direction === 'lower_is_better' ? 'at most' : 'at least'} ${money(n(row.target_value))}${row.currency ? ` ${row.currency}` : ''} for ${row.period_start} to ${row.period_end}`).join('; ') + '.',
      });
    }

    const gaps = [
      !totals.rows.length && 'no financial transactions in the last 12 months',
      totals.rows.length > 0 && !totals.rows.some((row) => row.transaction_type === 'revenue') && 'no revenue transactions',
      totals.rows.length > 0 && !totals.rows.some((row) => row.transaction_type === 'cost_of_goods_sold') && 'no cost of goods sold, so gross margin is unknown',
      !contracts.rows.length && 'no recurring customer contracts (MRR/ARR unknown)',
      !pipeline.rows.length && 'no sales pipeline',
      monthly.rows.length > 0 && new Set(monthly.rows.map((row) => row.month)).size < 3 && 'records cover fewer than three months, so trends are unreliable',
      totals.rows.length > 0 && !customers.rows.length && 'revenue is not tagged by customer, so concentration risk is unknown',
    ].filter((gap): gap is string => typeof gap === 'string');
    if (gaps.length) sections.push({ key: 'finance:gaps', title: 'Financial data gaps', text: `Missing: ${gaps.join('; ')}.` });

    const text = [
      `FINANCIAL RECORDS DIGEST (committed Executive Intelligence imports, ${start} to ${end}; amounts in their own currency, never converted)`,
      ...sections.map((section) => `[${section.key}] ${section.title}: ${section.text}`),
    ].join('\n');
    return { windowStart: start, windowEnd: end, currencies, sections, text };
  }
}
