'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BarChart3, Download, Megaphone } from 'lucide-react';
import { api } from '@/lib/api';
import { AreaSparkline } from '@/components/ui/area-sparkline';

type Entry = {
  campaign: string; channel: string; segment: string | null; currency: string; through: string; spend: string;
  budget: string | null; cac: string | null; roas: string | null; leads: string | null; customers: string | null;
  lead_conversion_pct: string | null; attribution_model: string | null;
};
type Acquisition = {
  currency: string; spend: number; records: number; revenue: number | null; shareOfRevenuePct: number | null;
  trend: Array<{ label: string; value: number }>; topLines: Array<{ label: string; amount: number }>;
};
type MarketingData = { items: Entry[]; truncated: boolean; acquisition?: Acquisition[] };

const CAMPAIGN_COLUMNS = ['report_date', 'campaign', 'channel', 'currency', 'spend', 'segment', 'impressions', 'clicks', 'leads', 'customers', 'attributed_revenue', 'attribution_model', 'budget'];
const REQUIRED = new Set(['report_date', 'campaign', 'channel', 'currency', 'spend']);

function money(value: number | string | null, currency: string) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
  }
}
const monthLabel = (value: string) => new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));

function downloadTemplate() {
  const blob = new Blob([`${CAMPAIGN_COLUMNS.join(',')}\n`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'lumorius-campaign-import-template.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Marketing spend from committed transactions, plus campaign performance from campaign imports. */
export default function MarketingPanel() {
  const [days, setDays] = useState(30);
  const query = useQuery({
    queryKey: ['marketing-analytics', days],
    retry: false,
    queryFn: async () => (await api.get('/analytics/marketing', { params: { days } })).data.data as MarketingData,
  });
  const forbidden = (query.error as { response?: { status?: number } } | null)?.response?.status === 403;
  const acquisition = query.data?.acquisition ?? [];
  const campaigns = query.data?.items ?? [];

  return (
    <section id="marketing-intelligence" className="scroll-mt-16 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-labelledby="marketing-analytics-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="marketing-analytics-title" className="flex items-center gap-2 text-lg font-semibold"><BarChart3 className="h-5 w-5 text-cyan-500" /> Marketing Intelligence</h2>
          <p className="mt-1 text-sm text-muted-foreground">Marketing spend from your financial records, and campaign results from campaign imports. Currencies are kept separate.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Marketing reporting period" value={days} onChange={(event) => setDays(Number(event.target.value))} className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm">
            {[30, 90, 365].map((n) => <option key={n} value={n}>Last {n} days</option>)}
          </select>
          <Link className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted" href="/agent-command?intent=marketing">Draft a strategy <ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </div>
      </div>

      {query.isPending && <div aria-hidden="true" className="lm-skeleton mt-4 h-40 rounded-xl" />}
      {query.isError && (
        <p role="alert" className="mt-4 text-sm text-muted-foreground">
          {forbidden ? 'Marketing figures are visible to workspace owners and administrators.' : 'Marketing data could not be loaded. Refresh to try again.'}
        </p>
      )}

      {query.data && (
        <div className="mt-5 space-y-6">
          <div>
            <h3 className="text-sm font-semibold">Marketing spend <span className="font-normal text-muted-foreground">· customer acquisition transactions</span></h3>
            {acquisition.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                No customer acquisition spend recorded in the last {days} days. Import transactions with the type <span className="font-mono text-xs">acquisition_cost</span> in{' '}
                <Link href="/executive-intelligence?view=sources" className="font-medium text-primary underline underline-offset-2">Executive Intelligence</Link>.
              </p>
            ) : (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {acquisition.map((row) => (
                  <article key={row.currency} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-mono text-2xl font-semibold tabular-nums">{money(row.spend, row.currency)}</p>
                      <p className="text-xs text-muted-foreground">{row.records} record{row.records === 1 ? '' : 's'} · last {days} days</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {row.shareOfRevenuePct === null ? 'No revenue in this period to compare against.' : `${row.shareOfRevenuePct.toLocaleString('en-US')}% of revenue (${money(row.revenue, row.currency)}) in the same period.`}
                    </p>
                    {row.trend.some((point) => point.value > 0) && (
                      <div className="mt-3">
                        <AreaSparkline points={row.trend} tone="chart-2" height={48} label={`${row.currency} marketing spend by month`} formatValue={(value) => money(value, row.currency)} formatLabel={monthLabel} />
                        <p className="mt-1 text-xs text-muted-foreground">Monthly, {monthLabel(row.trend[0].label)} – {monthLabel(row.trend[row.trend.length - 1].label)}</p>
                      </div>
                    )}
                    {row.topLines.length > 0 && (
                      <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                        {row.topLines.map((line) => (
                          <li key={line.label} className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-foreground/90">{line.label}</span>
                            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{money(line.amount, row.currency)} · {Math.round((line.amount / row.spend) * 100)}%</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Megaphone className="h-4 w-4 text-muted-foreground" /> Campaigns</h3>
            {campaigns.length === 0 ? (
              <div className="mt-2 rounded-lg border border-dashed border-border p-4 text-sm">
                <p className="text-muted-foreground">No campaign results imported for the last {days} days. Import a CSV or Excel file of daily campaign results to see spend, acquisition cost, ROAS and lead conversion per campaign.</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Columns:{' '}
                  {CAMPAIGN_COLUMNS.map((column, index) => (
                    <span key={column}><span className={`font-mono ${REQUIRED.has(column) ? 'font-semibold text-foreground' : ''}`}>{column}</span>{index < CAMPAIGN_COLUMNS.length - 1 ? ', ' : ''}</span>
                  ))}
                  . The first five are required.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"><Download className="h-3.5 w-3.5" /> Download template</button>
                  <Link href="/executive-intelligence?view=sources" className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Import campaigns <ArrowUpRight className="h-3.5 w-3.5" /></Link>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[730px] text-left text-sm">
                    <thead className="text-xs text-muted-foreground"><tr>{['Campaign', 'Spend', 'Budget', 'Acquisition cost', 'ROAS', 'Lead conversion', 'Data through'].map((v) => <th key={v} scope="col" className="p-2 font-medium">{v}</th>)}</tr></thead>
                    <tbody>
                      {campaigns.map((row) => (
                        <tr key={[row.campaign, row.channel, row.segment, row.currency].join(':')} className="border-t border-border">
                          <th scope="row" className="p-2 font-medium">{row.campaign}<span className="block text-xs font-normal text-muted-foreground">{row.channel}{row.segment ? ` · ${row.segment}` : ''}</span></th>
                          <td className="p-2 tabular-nums">{money(row.spend, row.currency)}</td>
                          <td className="p-2 tabular-nums">{money(row.budget, row.currency)}</td>
                          <td className="p-2 tabular-nums">{money(row.cac, row.currency)}</td>
                          <td className="p-2 tabular-nums">{row.roas === null ? '—' : `${Number(row.roas).toFixed(2)}×`}{row.attribution_model && <span className="block text-xs text-muted-foreground">{row.attribution_model}</span>}</td>
                          <td className="p-2 tabular-nums">{row.lead_conversion_pct === null ? '—' : `${Number(row.lead_conversion_pct).toFixed(1)}%`}</td>
                          <td className="p-2">{row.through}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">A dash means the figures needed for that measure were missing. Rows for different currencies or audiences should not be added together.{query.data.truncated ? ' Showing the 50 most recently reported groups.' : ''}</p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
