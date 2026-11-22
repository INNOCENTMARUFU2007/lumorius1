import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { costLine } from '../executive-intelligence/financial-digest.service';

@Injectable()
export class MarketingAnalyticsService {
  constructor(private readonly db:DatabaseService) {}
  async overview(org: string, days: number, currency?: string, segment?: string) {
    const duration = [7,30,90,365].includes(days) ? days : 30;
    const result = await this.db.query<{
      scope: { currency: string; segment: string | null } | null;
      scopes: { currency: string; segment: string | null }[];
      rows: Record<string, unknown>[];
      through: string;
    }>(`
      WITH records AS MATERIALIZED (
        SELECT (d->>'report_date')::date AS day,d->>'currency' AS currency,d->>'segment' AS segment,
          d->>'campaign' AS campaign,d->>'channel' AS channel,d->>'attribution_model' AS model,
          (d->>'spend')::numeric AS spend,(d->>'budget')::numeric AS budget,(d->>'attributed_revenue')::numeric AS revenue,
          (d->>'impressions')::numeric AS impressions,(d->>'clicks')::numeric AS clicks,(d->>'leads')::numeric AS leads,(d->>'customers')::numeric AS customers
        FROM executive_import_rows r JOIN executive_imports i ON i.id=r.import_id AND i.organization_id=r.organization_id
        CROSS JOIN LATERAL (SELECT r.normalized_data AS d) input
        WHERE r.organization_id=$1 AND i.dataset_type='campaigns' AND i.status='committed'
          AND r.validation_status='committed' AND d ? 'campaign_key'
          AND (d->>'report_date')::date BETWEEN CURRENT_DATE - (2*$2::integer-1) AND CURRENT_DATE
      ), scopes AS (
        SELECT currency,segment,max(day) AS updated FROM records GROUP BY currency,segment
        ORDER BY max(day) DESC,segment NULLS FIRST,currency LIMIT 80
      ), selected AS (
        SELECT currency,segment FROM scopes
        ORDER BY (currency=$3 AND segment IS NOT DISTINCT FROM $4) DESC NULLS LAST,segment NULLS FIRST,updated DESC,currency LIMIT 1
      ), chosen AS (
        SELECT r.*,CASE WHEN day >= CURRENT_DATE - ($2::integer - 1) THEN 'current' ELSE 'previous' END AS period
        FROM records r JOIN selected s ON s.currency=r.currency AND s.segment IS NOT DISTINCT FROM r.segment
      ), aggregated AS (
        SELECT CASE WHEN grouping(day)=0 THEN 'day' WHEN grouping(campaign,channel)=0 THEN 'campaign'
          WHEN grouping(channel)=0 THEN 'channel' WHEN grouping(model)=0 THEN 'model' ELSE 'summary' END AS kind,
          period, day::text AS date, campaign,channel,model,count(*)::int AS records,max(day)::text AS latest,
          sum(spend) AS spend,CASE WHEN count(budget)=count(*) THEN sum(budget) END AS budget,
          CASE WHEN count(revenue)=count(*) AND count(model)=count(*) AND count(DISTINCT model)=1 THEN sum(revenue) END AS revenue,
          CASE WHEN count(revenue)=count(*) AND count(model)=count(*) AND count(DISTINCT model)=1 THEN min(model) END AS revenue_model,
          CASE WHEN count(impressions)=count(*) THEN sum(impressions) END AS impressions,
          CASE WHEN count(clicks)=count(*) THEN sum(clicks) END AS clicks,CASE WHEN count(leads)=count(*) THEN sum(leads) END AS leads,
          CASE WHEN count(customers)=count(*) THEN sum(customers) END AS customers
        FROM chosen WHERE period='current' OR day IS NOT NULL
        GROUP BY GROUPING SETS ((period),(period,day),(period,channel),(period,campaign,channel),(period,model))
      ), ranked AS (
        SELECT *,row_number() OVER (PARTITION BY kind,period ORDER BY spend DESC NULLS LAST,campaign,channel,model,date) AS position
        FROM aggregated
      )
      SELECT (SELECT to_jsonb(s) FROM selected s) AS scope,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('currency',currency,'segment',segment) ORDER BY currency,segment NULLS FIRST) FROM scopes),'[]') AS scopes,
        COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'position' ORDER BY r.kind,r.date,r.position) FROM ranked r
          WHERE (r.period='current' OR r.kind='summary') AND (r.kind='day' OR r.position<=30)),'[]') AS rows,
        CURRENT_DATE::text AS through
    `, [org,duration,typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : null,
      typeof segment === 'string' && segment.length <= 180 ? segment : null]);
    return { days: duration, ...result.rows[0] };
  }

  async dashboard(org:string,days=30) {
    const duration=[30,90,365].includes(days)?days:30;
    const result = await this.db.query(`WITH records AS (
      SELECT r.normalized_data d
      FROM executive_import_rows r JOIN executive_imports i ON i.organization_id=r.organization_id AND i.id=r.import_id
      WHERE r.organization_id=$1 AND i.dataset_type='campaigns' AND i.status='committed'
        AND r.validation_status='committed' AND r.normalized_data ? 'campaign_key'
        AND (r.normalized_data->>'report_date')::date BETWEEN CURRENT_DATE - ($2::integer - 1) AND CURRENT_DATE
    ), aggregated AS (
      SELECT d->>'campaign' AS campaign, d->>'channel' AS channel, d->>'segment' AS segment, d->>'currency' AS currency,
        count(*) AS records, MAX(d->>'report_date') AS through,
        SUM((d->>'spend')::numeric) AS spend, SUM((d->>'budget')::numeric) AS budget,
        SUM((d->>'attributed_revenue')::numeric) AS attributed_revenue,
        SUM((d->>'impressions')::numeric) AS impressions,SUM((d->>'clicks')::numeric) AS clicks,
        SUM((d->>'leads')::numeric) AS leads,SUM((d->>'customers')::numeric) AS customers,
        count(d->>'attributed_revenue') AS revenue_count, count(d->>'customers') AS customers_count,
        count(d->>'leads') AS leads_count,count(d->>'clicks') AS clicks_count,count(d->>'impressions') AS impressions_count,
        count(d->>'budget') AS budget_count,count(DISTINCT d->>'attribution_model') AS methods,
        MAX(d->>'attribution_model') AS attribution_model
      FROM records GROUP BY campaign,channel,segment,currency
    ) SELECT campaign,channel,segment,currency,records,through,spend,
      CASE WHEN budget_count=records THEN budget END AS budget,
      CASE WHEN revenue_count=records AND methods=1 THEN attributed_revenue END AS attributed_revenue,
      CASE WHEN revenue_count=records AND methods=1 THEN attribution_model END AS attribution_model,
      CASE WHEN customers_count=records AND customers>0 THEN ROUND(spend/customers,4) END AS cac,
      CASE WHEN revenue_count=records AND methods=1 AND spend>0 THEN ROUND(attributed_revenue/spend,4) END AS roas,
      CASE WHEN customers_count=records AND leads_count=records AND leads>0 THEN ROUND(100*customers/leads,4) END AS lead_conversion_pct,
      CASE WHEN clicks_count=records AND impressions_count=records AND impressions>0 THEN ROUND(100*clicks/impressions,4) END AS ctr_pct,
      CASE WHEN customers_count=records THEN customers END AS customers,
      CASE WHEN leads_count=records THEN leads END AS leads
    FROM aggregated ORDER BY through DESC, campaign,channel,segment,currency LIMIT 51`,[org,duration]);
    return { days:duration,items:result.rows.slice(0,50),truncated:result.rows.length>50, acquisition: await this.acquisition(org, duration) };
  }

  /**
   * Marketing spend recorded as customer-acquisition transactions in Executive Intelligence,
   * per currency: the selected period, a 12-month trend, the largest lines and the share of revenue.
   */
  async acquisition(org: string, days: number) {
    const [totals, monthly, lines] = await Promise.all([
      this.db.query<{ currency: string; spend: string; records: number; revenue: string | null }>(
        `SELECT BTRIM(currency) AS currency,
                COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'acquisition_cost'), 0)::numeric AS spend,
                COUNT(*) FILTER (WHERE transaction_type = 'acquisition_cost')::int AS records,
                SUM(amount) FILTER (WHERE transaction_type = 'revenue')::numeric AS revenue
           FROM executive_financial_transactions
          WHERE organization_id = $1 AND transaction_date BETWEEN CURRENT_DATE - ($2::integer - 1) AND CURRENT_DATE
          GROUP BY 1 HAVING COUNT(*) FILTER (WHERE transaction_type = 'acquisition_cost') > 0
          ORDER BY 2 DESC`,
        [org, days],
      ),
      this.db.query<{ currency: string; month: string; spend: string }>(
        `SELECT c.currency, TO_CHAR(m, 'YYYY-MM') AS month, COALESCE(SUM(t.amount), 0)::numeric AS spend
           FROM generate_series(DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months', DATE_TRUNC('month', CURRENT_DATE), INTERVAL '1 month') AS m
           CROSS JOIN (SELECT DISTINCT BTRIM(currency) AS currency FROM executive_financial_transactions
                        WHERE organization_id = $1 AND transaction_type = 'acquisition_cost') c
           LEFT JOIN executive_financial_transactions t
             ON t.organization_id = $1 AND t.transaction_type = 'acquisition_cost' AND BTRIM(t.currency) = c.currency
            AND t.transaction_date >= m AND t.transaction_date < m + INTERVAL '1 month' AND t.transaction_date <= CURRENT_DATE
          GROUP BY 1, 2 ORDER BY 1, 2`,
        [org],
      ),
      this.db.query<{ currency: string; description: string | null; amount: string }>(
        `SELECT BTRIM(currency) AS currency, description, amount::numeric AS amount
           FROM executive_financial_transactions
          WHERE organization_id = $1 AND transaction_type = 'acquisition_cost'
            AND transaction_date BETWEEN CURRENT_DATE - ($2::integer - 1) AND CURRENT_DATE
          ORDER BY amount DESC LIMIT 500`,
        [org, days],
      ),
    ]);
    return totals.rows.map((row) => {
      const grouped = new Map<string, number>();
      for (const line of lines.rows.filter((item) => item.currency === row.currency)) {
        const label = costLine(line.description);
        grouped.set(label, (grouped.get(label) ?? 0) + Number(line.amount));
      }
      const spend = Number(row.spend);
      const revenue = row.revenue === null ? null : Number(row.revenue);
      return {
        currency: row.currency,
        spend,
        records: Number(row.records),
        revenue,
        shareOfRevenuePct: revenue && revenue > 0 ? Math.round((spend / revenue) * 1000) / 10 : null,
        trend: monthly.rows.filter((item) => item.currency === row.currency).map((item) => ({ label: item.month, value: Number(item.spend) })),
        topLines: Array.from(grouped.entries()).sort(([, a], [, b]) => b - a).slice(0, 5).map(([label, amount]) => ({ label, amount: Math.round(amount * 100) / 100 })),
      };
    });
  }
}
