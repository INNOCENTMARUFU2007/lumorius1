'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import api from '@/lib/api';

type MetricRecord = Record<string, unknown>;

type PortfolioData = {
  summary: {
    total: number;
    active: number;
    implemented: number;
    reviewed: number;
    assessed: number;
    achieved: number;
    partiallyAchieved: number;
    positiveOutcomeRate: number | null;
    achievementRate: number | null;
  };
  velocity: {
    proposalToApprovalHours: number | null;
    approvalToImplementationHours: number | null;
    implementationToReviewHours: number | null;
  };
  categories: Array<MetricRecord & {
    decisionType: string;
    decisions: number;
    assessed: number;
    positiveOutcomeRate: number | null;
  }>;
  teams: Array<MetricRecord & {
    teamId: string | null;
    teamName: string;
    decisions: number;
    implemented: number;
    reviewed: number;
    assessed: number;
    positiveOutcomeRate: number | null;
  }>;
  monthlyTrend: Array<MetricRecord & {
    month: string;
    label: string;
    created: number;
    proposed: number;
    approved: number;
    implemented: number;
    reviewed: number;
  }>;
  bottlenecks: {
    overdueDecisions: number;
    overdueReviews: number;
    unassignedActive: number;
    missingReviewDates: number;
    missingExpectedOutcomes: number;
    pendingApproval: number;
    awaitingImplementation: number;
  };
};

function unwrap(value: unknown): unknown {
  let current = value;
  for (let index = 0; index < 2; index += 1) {
    if (current && typeof current === 'object' && 'data' in current) {
      current = (current as { data: unknown }).data;
    } else {
      break;
    }
  }
  return current;
}

function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Not enough data';
  if (value < 24) return `${value.toFixed(1)} hours`;
  return `${(value / 24).toFixed(1)} days`;
}

function displayRate(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not assessed';
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(0)}%` : '—';
}

function displayCount(value: unknown): string {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString() : '0';
}

const numberCardClass = 'min-w-0 rounded-xl border border-border bg-background p-3 sm:p-4';

export default function DecisionPortfolioPanel() {
  const portfolioQuery = useQuery<PortfolioData>({
    queryKey: ['decisions', 'portfolio-analytics'],
    queryFn: async () => {
      const response = await api.get('/knowledge/decisions/portfolio/analytics');
      return unwrap(response.data) as PortfolioData;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });

  const data = portfolioQuery.data;
  const summary = data?.summary;
  const bottlenecks = data?.bottlenecks;
  const trend = data?.monthlyTrend ?? [];
  const categories = data?.categories ?? [];
  const teams = data?.teams ?? [];
  const maxTrend = Math.max(
    1,
    ...trend.flatMap(point => [
      point.created,
      point.approved,
      point.implemented,
      point.reviewed,
    ]),
  );

  return (
    <section
      data-v49="decision-portfolio-intelligence"
      className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
      aria-label="Decision portfolio intelligence"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-brand-500" />
            <h2 className="text-sm font-semibold">Decision Portfolio Intelligence</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Organisation-wide decision performance, lifecycle velocity and operational bottlenecks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void portfolioQuery.refetch()}
          disabled={portfolioQuery.isFetching}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${portfolioQuery.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {portfolioQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : portfolioQuery.isError ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm">
          <p className="font-medium text-rose-600">Portfolio analytics unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check the API connection and access permissions, then refresh this panel.
          </p>
        </div>
      ) : data && summary && bottlenecks ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <div className={numberCardClass}>
              <p className="text-xs text-muted-foreground">Total decisions</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{displayCount(summary.total)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Visible portfolio</p>
            </div>
            <div className={numberCardClass}>
              <p className="text-xs text-muted-foreground">Active pipeline</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{displayCount(summary.active)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Proposed, approved or implemented</p>
            </div>
            <div className={numberCardClass}>
              <p className="text-xs text-muted-foreground">Implemented</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{displayCount(summary.implemented)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Awaiting or completed review</p>
            </div>
            <div className={numberCardClass}>
              <p className="text-xs text-muted-foreground">Reviewed</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{displayCount(summary.reviewed)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Outcome assessment recorded</p>
            </div>
            <div className={numberCardClass}>
              <p className="text-xs text-muted-foreground">Achieved outcomes</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{displayRate(summary.achievementRate)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{displayCount(summary.assessed)} assessments</p>
            </div>
            <div className={numberCardClass}>
              <p className="text-xs text-muted-foreground">Positive outcomes</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{displayRate(summary.positiveOutcomeRate)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Achieved or partially achieved</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="min-w-0 rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-brand-500" />
                <h3 className="text-xs font-semibold">Decision velocity</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Average elapsed time between audited lifecycle transitions</p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="min-w-0">
                  <p className="text-xs leading-4 text-muted-foreground">Proposal → approval</p>
                  <p className="mt-1 break-words text-lg font-semibold tabular-nums">{formatHours(data.velocity.proposalToApprovalHours)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs leading-4 text-muted-foreground">Approval → implementation</p>
                  <p className="mt-1 break-words text-lg font-semibold tabular-nums">{formatHours(data.velocity.approvalToImplementationHours)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs leading-4 text-muted-foreground">Implementation → review</p>
                  <p className="mt-1 break-words text-lg font-semibold tabular-nums">{formatHours(data.velocity.implementationToReviewHours)}</p>
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h3 className="text-xs font-semibold">Portfolio bottlenecks</h3>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Overdue decisions</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{displayCount(bottlenecks.overdueDecisions)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Overdue reviews</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{displayCount(bottlenecks.overdueReviews)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unassigned active</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{displayCount(bottlenecks.unassignedActive)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Missing review dates</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{displayCount(bottlenecks.missingReviewDates)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Missing expected outcomes</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{displayCount(bottlenecks.missingExpectedOutcomes)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pending approval</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{displayCount(bottlenecks.pendingApproval)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-brand-500" />
                <h3 className="text-xs font-semibold">Six-month decision throughput</h3>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Created</span>
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />Approved</span>
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" />Implemented</span>
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Reviewed</span>
              </div>
              {trend.length === 0 ? (
                <p className="mt-4 text-xs text-muted-foreground">No monthly activity is available yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {trend.map(point => (
                    <div key={point.month} className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3">
                      <span className="text-xs text-muted-foreground">{point.label}</span>
                      <div className="space-y-1.5">
                        {([
                          ['created', point.created, 'bg-slate-400'],
                          ['approved', point.approved, 'bg-sky-500'],
                          ['implemented', point.implemented, 'bg-violet-500'],
                          ['reviewed', point.reviewed, 'bg-emerald-500'],
                        ] as const).map(([key, value, color]) => (
                          <div key={key} className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, (Number(value) / maxTrend) * 100)}%` }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="min-w-0 rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-brand-500" />
                <h3 className="text-xs font-semibold">Effectiveness by decision category</h3>
              </div>
              {categories.length === 0 ? (
                <p className="mt-4 text-xs text-muted-foreground">Category performance will appear as decisions are recorded.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {categories.map(item => (
                    <div key={item.decisionType} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate capitalize font-medium">{item.decisionType}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {displayRate(item.positiveOutcomeRate)} · {displayCount(item.assessed)} assessed
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.max(0, Math.min(100, Number(item.positiveOutcomeRate ?? 0)))}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">{displayCount(item.decisions)} decisions in portfolio</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-border p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-500" />
              <h3 className="text-xs font-semibold">Team decision performance</h3>
            </div>
            {teams.length === 0 ? (
              <p className="mt-4 text-xs text-muted-foreground">Team performance will appear as decisions are assigned to teams.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-xs  text-muted-foreground">
                    <tr>
                      <th className="pb-2 pr-3 font-semibold">Team</th>
                      <th className="pb-2 pr-3 text-right font-semibold">Decisions</th>
                      <th className="pb-2 pr-3 text-right font-semibold">Implemented</th>
                      <th className="pb-2 pr-3 text-right font-semibold">Reviewed</th>
                      <th className="pb-2 text-right font-semibold">Positive outcomes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map(team => (
                      <tr key={team.teamId ?? 'organisation-wide'} className="border-t border-border">
                        <td className="py-2.5 pr-3 font-medium">{team.teamName}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{displayCount(team.decisions)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{displayCount(team.implemented)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{displayCount(team.reviewed)}</td>
                        <td className="py-2.5 text-right tabular-nums">{displayRate(team.positiveOutcomeRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs leading-4 text-muted-foreground">
            Portfolio metrics include only decisions visible to your organisation role and team membership. Outcome rates use assessed decisions as the denominator; velocity uses audited lifecycle transition timestamps.
          </p>
        </>
      ) : null}
    </section>
  );
}
