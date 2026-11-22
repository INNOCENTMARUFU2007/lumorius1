'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Bell, CircleCheck, ClipboardList, Clock, GitBranch, Plus, ShieldCheck, Target } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import api from '@/lib/api';
import { PageHeader } from '@/components/ui/primitives';

type Schedule = {
  cadence: 'off' | 'daily' | 'weekly' | 'monthly'; hourUtc: number; weekday: number;
  nextDeliveryAt: string | null; lastDeliveredAt: string | null;
};
type Item = {
  id: string; kind: string; item_key: string; title: string; reason: string; next_step: string;
  severity: number; deadline: string | null; owner_name: string | null;
  disposition: 'useful' | 'dismissed' | null; source: string;
  follow_up_id: string | null; follow_up_status: string | null;
};
type Goal = {
  id: string; title: string; status: string; progress: number | string; owner_name: string | null; due_date: string | null;
  indicators: { id: string; title: string; current_value: number | null; start_value?: number | null; target_value: number; unit: string | null }[];
  history: { id: number; recorded_at: string; progress: number }[];
};
type Decision = {
  id: string; title: string; status: string; rationale: string | null; decision_maker: string | null;
  decision_at: string | null; review_due_at: string | null;
};
type Briefing = {
  generatedAt: string; schedule: Schedule; items: Item[]; goals: Goal[]; decisions: Decision[];
  workflows: { id: string; name: string; last_run_at: string | null }[];
  workflowRequests: { id: string; name: string; status: string; requested_by: string; requester_id: string; created_at: string; run_id: string | null; run_status: string | null }[];
};
const endpoint = '/workspace/briefing';
const labels: Record<string, string> = {
  approval: 'Approval', commitment: 'Commitment', project: 'Project', decision: 'Decision',
  meeting: 'Meeting', objective: 'Objective', kpi: 'KPI', renewal: 'Renewal', financial_approval: 'Financial review',
};
const control = 'rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40';
const actionLink = 'inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline dark:text-sky-300';

function date(value: string | null, withTime = false) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (withTime) return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : undefined }).format(parsed);
}

function errorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' ? message : fallback;
}

function ScheduleForm({ schedule, onSave, pending }: {
  schedule: Schedule; pending: boolean; onSave: (schedule: Pick<Schedule, 'cadence' | 'hourUtc' | 'weekday'>) => void;
}) {
  const [cadence, setCadence] = useState(schedule.cadence);
  const [hourUtc, setHour] = useState(schedule.hourUtc);
  const [weekday, setWeekday] = useState(schedule.weekday);
  return (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onSave({ cadence, hourUtc, weekday }); }}>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs text-muted-foreground">Frequency
          <select className={control + ' block w-full text-foreground'} value={cadence} onChange={(event) => setCadence(event.target.value as Schedule['cadence'])}>
            <option value="off">Off</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly · first day</option>
          </select>
        </label>
        {cadence !== 'off' && <label className="space-y-1 text-xs text-muted-foreground">Hour (UTC)
          <select className={control + ' block w-full text-foreground'} value={hourUtc} onChange={(event) => setHour(Number(event.target.value))}>
            {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
          </select>
        </label>}
        {cadence === 'weekly' && <label className="space-y-1 text-xs text-muted-foreground">Day
          <select className={control + ' block w-full text-foreground'} value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => <option key={day} value={index + 1}>{day}</option>)}
          </select>
        </label>}
      </div>
      <button className={control} disabled={pending} type="submit">Save schedule</button>
      <p className="text-xs text-muted-foreground">Next notification {date(schedule.nextDeliveryAt, true)}<br />Last sent {date(schedule.lastDeliveredAt, true)}</p>
    </form>
  );
}

export default function ChiefOfStaffPage() {
  const { user, isLoading } = useAuth();
  const ready = Boolean(user?.organizationId) && ['owner', 'admin', 'manager', 'member'].includes(user?.role ?? '');
  const queryClient = useQueryClient();
  const canManage = ['manager', 'admin', 'owner'].includes(user?.role ?? '');
  const queryKey = ['chief-of-staff', user?.organizationId, user?.id];
  const [filter, setFilter] = useState('all');
  const [showDismissed, setShowDismissed] = useState(false);
  const query = useQuery({
    queryKey, enabled: ready, refetchInterval: 60_000,
    queryFn: async () => (await api.get<{ data: Briefing }>(endpoint)).data.data,
  });
  const changes = useMutation({
    mutationFn: async ({ path, method, body }: { path: string; method: 'post' | 'put'; body?: object }) => api[method](endpoint + path, body ?? {}),
    onSuccess: (_, change) => {
      const message = change.path === '/tasks' ? 'Follow-up task created' : change.path === '/schedule' ? 'Briefing schedule saved' : change.path === '/feedback' ? 'Feedback saved' : change.path.endsWith('/request') ? 'Workflow approval requested' : change.path.includes('/workflow-approvals/') ? 'Review saved' : 'Workflow queued';
      toast.success(message);
      void queryClient.invalidateQueries({ queryKey });
      if (change.path === '/tasks') void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      if (change.path.includes('/workflows/')) void queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'This change could not be saved.')),
  });
  const briefing = query.data;
  const active = briefing?.items.filter((item) => item.severity === 0 || item.disposition !== 'dismissed') ?? [];
  const visible = (showDismissed ? briefing?.items.filter((item) => item.severity > 0 && item.disposition === 'dismissed') ?? [] : active)
    .filter((item) => filter === 'all' || item.kind === filter);
  const approvals = active.filter((item) => ['approval', 'financial_approval'].includes(item.kind));

  function feedback(item: Item, disposition: 'useful' | 'dismissed' | 'reset') {
    changes.mutate({ method: 'put', path: '/feedback', body: { key: item.item_key, disposition } });
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6">
      <PageHeader
        hero
        icon={ClipboardList}
        title="Chief of Staff"
        description={<>Your commitments, decisions, and goals across Lumorius.{briefing && <span className="mt-1 flex items-center gap-1.5 text-xs"><Clock className="h-3.5 w-3.5" /> Updated {date(briefing.generatedAt, true)}</span>}</>}
        actions={<>
          <Link href="/founder-os?createGoal=1#create-goal" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-glow-primary transition hover:bg-primary/90 disabled:opacity-60"><Plus className="h-4 w-4" /> Create goal</Link>
          <Link href="/agent-command" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card/60 px-3.5 text-sm font-medium transition hover:bg-muted disabled:opacity-60">AI missions and goal proposals <ArrowUpRight className="h-4 w-4" /></Link>
        </>}
      />

      {isLoading || (ready && query.isPending) ? <p role="status" className="text-sm text-muted-foreground">Loading your briefing…</p> : null}
      {!isLoading && !ready && <p className="text-sm text-muted-foreground">Chief of Staff is available to workspace members.</p>}
      {query.isError && <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/40 p-4 text-sm"><p>{errorMessage(query.error, 'The briefing could not be loaded.')}</p><button className={control} onClick={() => void query.refetch()}>Retry</button></div>}

      {briefing && <>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold"><ClipboardList className="h-4 w-4" /> Priority queue</h2>
                <p className="mt-1 text-xs text-muted-foreground">{active.filter((item) => item.severity === 0).length} critical in view</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="briefing-filter">Filter priority queue</label>
                <select id="briefing-filter" className={control} value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="all">All sources</option>
                  {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button className={control} aria-pressed={showDismissed} onClick={() => setShowDismissed(!showDismissed)}>{showDismissed ? 'Show active' : 'Show dismissed'}</button>
              </div>
            </div>
            <ul className="max-h-[42rem] divide-y divide-border overflow-y-auto">
              {visible.map((item) => (
                <li key={item.item_key} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{labels[item.kind]}</span>
                    {item.severity === 0 && <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive">Critical</span>}
                    {item.disposition === 'useful' && <span>Marked useful</span>}
                    {item.owner_name && <span>· {item.owner_name}</span>}
                    {item.deadline && <span>· Due {date(item.deadline)}</span>}
                  </div>
                  <h3 className="mt-1.5 break-words font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.reason}. {item.next_step}</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                    <Link className={actionLink} href={item.source}>Open source <ArrowUpRight className="h-3.5 w-3.5" /></Link>
                    {showDismissed ? <button className={control} disabled={changes.isPending} onClick={() => feedback(item, 'reset')}>Restore</button> : <>
                      {item.follow_up_id && <Link className={actionLink} href={'/tasks?task=' + item.follow_up_id}>Follow-up · {item.follow_up_status?.replaceAll('_', ' ')} <ArrowUpRight className="h-3.5 w-3.5" /></Link>}
                      {!item.follow_up_id && !['renewal', 'kpi', 'financial_approval'].includes(item.kind) && <button className={control + ' inline-flex items-center gap-1'} disabled={changes.isPending} onClick={() => changes.mutate({ method: 'post', path: '/tasks', body: { key: item.item_key } })}><Plus className="h-3.5 w-3.5" /> Create follow-up</button>}
                      <button className={control} disabled={changes.isPending} onClick={() => feedback(item, item.disposition === 'useful' ? 'reset' : 'useful')}>{item.disposition === 'useful' ? 'Remove useful mark' : 'Mark useful'}</button>
                      {item.severity > 0 && <button className={control} disabled={changes.isPending} onClick={() => feedback(item, 'dismissed')}>Dismiss</button>}
                    </>}
                  </div>
                </li>
              ))}
            </ul>
            {visible.length === 0 && <p className="px-5 py-8 text-sm text-muted-foreground">{showDismissed ? 'No dismissed items for this filter.' : 'No priorities match this view.'}</p>}
          </section>

          <aside className="space-y-5">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><ShieldCheck className="h-4 w-4" /> Approval inbox</h2>
              {approvals.length === 0 && <p className="text-sm text-muted-foreground">No proposed decisions or financial items to review.</p>}
              <ul className="max-h-60 divide-y divide-border overflow-y-auto">
                {approvals.map((item) => <li key={item.item_key} className="py-2.5"><Link href={item.source} className="flex items-start justify-between gap-2 text-sm font-medium hover:underline">{item.title}<ArrowUpRight className="h-4 w-4 shrink-0" /></Link><p className="mt-1 text-xs text-muted-foreground">{item.reason}</p></li>)}
              </ul>
              {briefing.workflowRequests.length > 0 && <div className="mt-3 border-t border-border pt-3">
                <h3 className="text-sm font-medium">Workflow requests</h3>
                <ul className="divide-y divide-border">{briefing.workflowRequests.map((request) => <li key={request.id} className="space-y-2 py-2.5">
                  <p className="text-sm font-medium">{request.name}</p>
                  <p className="text-xs capitalize text-muted-foreground">{request.requested_by} · {request.run_status ?? request.status}</p>
                  {canManage && request.requester_id !== user?.id && !request.run_id && request.status !== 'rejected' && <div className="flex gap-2">
                    <button className={control} disabled={changes.isPending} onClick={() => changes.mutate({ method: 'post', path: '/workflow-approvals/' + request.id, body: { outcome: 'approved' } })}>{request.status === 'approved' ? 'Retry start' : 'Approve & run'}</button>
                    {request.status === 'pending' && <button className={control} disabled={changes.isPending} onClick={() => changes.mutate({ method: 'post', path: '/workflow-approvals/' + request.id, body: { outcome: 'rejected' } })}>Reject</button>}
                  </div>}
                </li>)}</ul>
              </div>}
              <Link className={actionLink + ' mt-3'} href="/decisions">Decision governance <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </section>
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><Bell className="h-4 w-4" /> Briefing delivery</h2>
              <ScheduleForm key={[user?.id, briefing.schedule.cadence, briefing.schedule.hourUtc, briefing.schedule.weekday].join(':')} schedule={briefing.schedule} pending={changes.isPending} onSave={(body) => changes.mutate({ method: 'put', path: '/schedule', body })} />
            </section>
            {(canManage || briefing.workflows.length > 0) && <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><GitBranch className="h-4 w-4" /> Active manual workflows</h2>
              {briefing.workflows.length === 0 && <p className="text-sm text-muted-foreground">No active manual workflows.</p>}
              <ul className="divide-y divide-border">
                {briefing.workflows.map((workflow) => <li key={workflow.id} className="flex items-center justify-between gap-3 py-2.5"><div><p className="text-sm font-medium">{workflow.name}</p><p className="text-xs text-muted-foreground">Last run {date(workflow.last_run_at)}</p></div><button className={control} disabled={changes.isPending} onClick={() => { if (!canManage || window.confirm('Run “' + workflow.name + '” now?')) changes.mutate({ method: 'post', path: '/workflows/' + workflow.id + (canManage ? '/run' : '/request') }); }}>{canManage ? 'Run' : 'Request'}</button></li>)}
              </ul>
              <Link className={actionLink + ' mt-3'} href="/workflows">Workflow history <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </section>}
          </aside>
        </div>

        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between gap-3 border-b border-border p-5"><h2 className="flex items-center gap-2 text-base font-semibold"><Target className="h-4 w-4" /> Goals and leading indicators</h2><Link className={actionLink} href="/founder-os">Founder OS <ArrowUpRight className="h-3.5 w-3.5" /></Link></header>
          {briefing.goals.length === 0 && <p className="p-5 text-sm text-muted-foreground">No objectives are assigned to this view.</p>}
          <div className="grid gap-px overflow-hidden rounded-b-xl bg-border md:grid-cols-2">
            {briefing.goals.map((goal) => <article key={goal.id} className="space-y-3 bg-card p-5">
              <div className="flex justify-between gap-4"><div><Link className="font-semibold hover:underline" href={'/founder-os#objective-' + goal.id}>{goal.title}</Link><p className="mt-1 text-xs capitalize text-muted-foreground">{goal.status.replaceAll('_', ' ')}{goal.owner_name ? ' · ' + goal.owner_name : ''}{goal.due_date ? ' · Due ' + date(goal.due_date) : ''}</p></div><span className="shrink-0 text-lg font-semibold tabular-nums">{Math.round(Number(goal.progress))}%</span></div>
              {goal.history.length > 0 && <div aria-label="Progress history" className="flex h-11 items-end gap-1">
                {goal.history.map((point) => <span key={point.id} title={date(point.recorded_at) + ' · ' + point.progress + '%'} className="flex-1 rounded-t-sm bg-sky-500/50" style={{ height: Math.max(4, Math.min(100, Number(point.progress))) + '%' }} />)}
              </div>}
              {goal.indicators.length > 0 && <dl className="divide-y divide-border">{goal.indicators.map((indicator) => <div key={indicator.id} className="flex justify-between gap-3 py-1.5 text-sm"><dt>{indicator.title}</dt><dd className="shrink-0 tabular-nums text-muted-foreground">{indicator.start_value === null ? 'Baseline unverified · target ' : (indicator.current_value ?? '—') + ' / '}{indicator.target_value} {indicator.unit}</dd></div>)}</dl>}
            </article>)}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between gap-3 border-b border-border p-5"><h2 className="flex items-center gap-2 text-base font-semibold"><CircleCheck className="h-4 w-4" /> Decision log</h2><Link className={actionLink} href="/decisions">All decisions <ArrowUpRight className="h-3.5 w-3.5" /></Link></header>
          {briefing.decisions.length === 0 && <p className="p-5 text-sm text-muted-foreground">No accessible decisions have reached the log.</p>}
          <ul className="divide-y divide-border">
            {briefing.decisions.map((decision) => <li key={decision.id} className="px-5 py-4"><Link className="text-sm font-semibold hover:underline" href={'/decisions?decision=' + decision.id}>{decision.title}</Link><p className="mt-1 text-xs text-muted-foreground">{decision.status} · {decision.decision_maker ?? 'No decision maker recorded'} · {date(decision.decision_at)}{decision.review_due_at ? ' · Review ' + date(decision.review_due_at) : ''}</p>{decision.rationale && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{decision.rationale}</p>}<Link className={actionLink + ' mt-2'} href={'/decisions?decision=' + decision.id}>Open rationale and evidence <ArrowUpRight className="h-3.5 w-3.5" /></Link></li>)}
          </ul>
        </section>
      </>}
    </main>
  );
}
