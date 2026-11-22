'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowUpRight, Bot, CheckCircle2, CircleAlert, History, Radio, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import {useAuth} from '@/hooks/use-auth';
import {resultLabel} from '../workflows/studio-state';

type Agent = { id: string; label: string; purpose: string; available: boolean; upgradeRequired?: boolean; reason: string | null };
type Metrics = {agent:string;runs:number;active:number;completed:number;failed:number;awaiting:number;actions:number;tokens:string;cost_usd:string|null;mean_seconds:string|null};
type Entry = { id: string; agent: string; intent: string; status: string; created_at: string };
type Level = 'low' | 'medium' | 'high';
type EvidenceItem = { key: string; title: string; href: string; detail: string };
type Recommendation = { title: string; rationale: string; expectedImpact: string; impact: Level; effort: Level; timeframe: string; firstSteps: string[]; evidenceKeys: string[] };
type Artifact = { summary: string; evidence: EvidenceItem[];
  goals: { title: string; rationale: string; dueDate: string; target: number; unit: string; metric: string; tasks: string[] }[];
  recommendations?: Recommendation[]; dataGaps?: string[] };

const LEVEL_STYLE: Record<string, Record<Level, string>> = {
  impact: { high: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300', medium: 'border-sky-400/30 bg-sky-400/10 text-sky-700 dark:text-sky-300', low: 'border-border bg-muted text-muted-foreground' },
  effort: { low: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300', medium: 'border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300', high: 'border-rose-400/30 bg-rose-400/10 text-rose-700 dark:text-rose-300' },
};

/** Text with [source-key] citations turned into small numbered links to the evidence. */
function CitedText({ text, evidence, className }: { text: string; evidence: EvidenceItem[]; className?: string }) {
  const index = new Map(evidence.map((item, position) => [item.key, position]));
  return (
    <p className={className}>
      {text.split(/(\[[^\]\n]{2,120}\])/g).map((part, i) => {
        const keys = /^\[[^\]]+\]$/.test(part) ? part.slice(1, -1).split(/\s*[,;]\s*/) : [];
        if (!keys.length || !keys.every((key) => index.has(key))) return part;
        return keys.map((key) => {
          const position = index.get(key)!;
          const item = evidence[position];
          return <a key={i + key} href={'#agent-evidence-' + position} title={item.title} className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-primary/10 px-1 align-text-top font-mono text-[11px] font-semibold text-primary no-underline hover:bg-primary/20">{position + 1}</a>;
        });
      })}
    </p>
  );
}

function Recommendations({ items, evidence }: { items: Recommendation[]; evidence: EvidenceItem[] }) {
  const index = new Map(evidence.map((item, position) => [item.key, position]));
  return (
    <section className="mt-5" aria-label="Recommendations">
      <h4 className="text-sm font-semibold">Recommendations</h4>
      <ol className="mt-3 grid gap-3 lg:grid-cols-2">
        {items.map((item, i) => (
          <li key={i} className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <h5 className="text-sm font-semibold leading-5">{item.title}</h5>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className={'rounded-full border px-2 py-0.5 font-medium ' + LEVEL_STYLE.impact[item.impact]}>Impact: {item.impact}</span>
                  <span className={'rounded-full border px-2 py-0.5 font-medium ' + LEVEL_STYLE.effort[item.effort]}>Effort: {item.effort}</span>
                  {item.timeframe && item.timeframe !== 'Not set' && <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{item.timeframe}</span>}
                </div>
                <CitedText text={item.rationale} evidence={evidence} className="mt-2 text-sm leading-6 text-foreground/90" />
                <p className="mt-2 text-xs leading-5"><span className="font-semibold">Expected impact: </span><span className="text-foreground/80">{item.expectedImpact}</span></p>
                {item.firstSteps.length > 0 && <div className="mt-2"><p className="text-xs font-semibold">First steps</p><ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-5 text-muted-foreground">{item.firstSteps.map((step, j) => <li key={j}>{step}</li>)}</ul></div>}
                {item.evidenceKeys.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Sources: {item.evidenceKeys.map((key) => index.has(key) ? <a key={key} href={'#agent-evidence-' + index.get(key)} className="mr-1.5 underline-offset-2 hover:underline">{evidence[index.get(key)!].title}</a> : null)}</p>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
type Run = { id: string; agent: string; mission?: string; status: string; artifact?: Artifact; artifactVersion: number; decisionId?: string; decisionStatus?: string;
  usage?: { tokens: number; costUsd: number | null };
  errorCode?: string; receipt?: { objectiveId: string; taskIds: string[] }[];
  timeline?: { id: string; stage: string; status: string; created_at: string }[] };
const active = (status?: string) => status === 'queued' || status === 'running';
const phrase = (state: string) => state.replaceAll('_',' ');
const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50';
const errorText = (error: unknown) => {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(message) ? message.join(' ') : message || 'Unable to load the agent workspace. Try again.';
};
const fetchData = async <T,>(path: string): Promise<T> => (await api.get(path)).data.data;
const postData = async <T,>(path: string, body?: unknown): Promise<T> => (await api.post(path,body)).data.data;
const failures: Record<string,string> = {
  quota: 'This workspace has reached its AI token allowance.',
  interrupted: 'The run stopped before any result could be saved.',
  access_changed: 'Access changed while the agent was working.',
  invalid_output: 'The AI result could not be validated. Try a more specific mission.',
  run_failed: 'The mission failed. Check the available sources and try again.',
  unavailable: 'The AI provider is unavailable. Ask an admin to check the AI provider and its API key in Settings → AI.',
  provider_unavailable: 'The AI provider rejected its API key. Ask an admin to update the key on the server, or switch provider in Settings → AI.',
  provider_no_credit: "The AI provider account has no credit left. An admin needs to add credit in the provider's billing settings, then run the mission again.",
  provider_rate_limited: 'The AI provider is busy right now. Wait a minute and run the mission again.',
};

export default function AgentCommandCenter({ dedicated = false, mode = 'all', missionDraft, onResult }: { dedicated?: boolean; mode?: 'all'|'missions'|'results'; missionDraft?:string; onResult?:()=>void }) {
  const qc = useQueryClient();
  const {user}=useAuth();const scope=user?.organizationId+':'+user?.id;
  useEffect(()=>{if(missionDraft){setMission(missionDraft);setAgent('chief-of-staff');setIntent('briefing');}},[missionDraft]);
  const rememberRun=(id:string)=>{const url=new URL(window.location.href);url.searchParams.set('runId',id);url.searchParams.delete('workflowId');if(url.pathname==='/workflows')url.searchParams.set('studio','results');window.history.replaceState(null,'',url);};
  const [expanded,setExpanded]=useState(dedicated);
  const [agent,setAgent]=useState('chief-of-staff');
  const [intent,setIntent]=useState('briefing');
  const [mission,setMission]=useState('');
  const [marketCountry,setMarketCountry]=useState('');
  const [runId,setRunId]=useState<string | null>(null);
  const [reviewId,setReviewId]=useState<string | null>(null);
  const [review,setReview]=useState<Run | null>(null);
  const [filter,setFilter]=useState('');
  const [cursor,setCursor]=useState<string>();
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    const own = params.get('runId');
    if (own && /^[0-9a-f-]{36}$/i.test(own)) { setRunId(own); setExpanded(true); }
    const id = params.get('agentRun');
    if (id && /^[0-9a-f-]{36}$/i.test(id)) { setReviewId(id); setExpanded(true); }
    if (params.get('view') === 'agents') setExpanded(true);
    const draft=params.get('mission');
    if (draft && draft.length<=2000) setMission(draft);
    const preset=params.get('agent');
    if (preset && /^[a-z-]{3,40}$/.test(preset)) { setAgent(preset); setIntent(preset==='chief-of-staff'?'briefing':'analysis'); setExpanded(true); }
    if (params.get('intent') === 'goals') { setIntent('goals'); setExpanded(true); }
    if (params.get('intent') === 'marketing') {
      setIntent('marketing');
      setExpanded(true);
      const target = params.get('country') ?? '';
      if (['NG','ZA','KE','GH','EG','GB','US','DE','IN','BR','CA','AE'].includes(target)) setMarketCountry(target);
    }
  },[]);
  const catalog = useQuery({ queryKey:['agent-catalog',scope], queryFn:()=>fetchData<Agent[]>('/agents'), enabled:expanded, retry:false });
  const metrics = useQuery({queryKey:['agent-metrics',scope],queryFn:()=>fetchData<Metrics[]>('/agents/metrics'),enabled:expanded && catalog.isSuccess,retry:false});
  const history = useQuery({ queryKey:['agent-runs',filter,cursor,scope], queryFn:()=>fetchData<{ items: Entry[]; nextCursor: string | null }>('/agents/runs?'+new URLSearchParams({
    ...(filter ? { status:filter } : {}), ...(cursor ? {cursor} : {}),
  })), enabled:expanded && catalog.isSuccess, retry:false,
    refetchInterval:q=>q.state.data?.items.some(x=>active(x.status)) ? 3500 : false });
  const selected = useQuery({ queryKey:['agent-run',runId,scope],queryFn:()=>fetchData<Run>('/agents/runs/'+runId),enabled:!!runId,retry:false,
    refetchInterval:q=>active(q.state.data?.status) ? 2500 : false });
  const refresh = () => { void qc.invalidateQueries({queryKey:['agent-runs']}); void qc.invalidateQueries({queryKey:['agent-run']}); void qc.invalidateQueries({queryKey:['agent-metrics']}); };
  const create = useMutation({
    mutationFn: (data: { agent: string; intent: string; mission: string; idempotencyKey: string; marketCountry?: string }) => postData<{id:string}>('/agents/runs',data),
    onSuccess: ({id})=>{rememberRun(id);onResult?.();setRunId(id);setReview(null);setReviewId(null);setMission('');setCursor(undefined);refresh();},
  });
  const action = useMutation({
    mutationFn: async ({id,op,version}:{id:string;op:string;version?:number}) => op === 'review'
      ? setReview(await postData<Run>('/agents/runs/'+id+'/review'))
      : postData('/agents/runs/'+id+'/'+op,version ? {version} : undefined),
    onSuccess:refresh,
  });
  const run=review ?? selected.data;
  const selectedAgent = catalog.data?.find(item=>item.id===agent);
  const [formError, setFormError] = useState<string | null>(null);
  const available = selectedAgent?.available;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-label="Agent missions and history">
      {!dedicated && <button type="button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded} className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-6">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"><Bot className="h-5 w-5" /></span>
        <span className="flex-1"><span id="agent-center-title" className="block text-base font-semibold">Agent Command Center</span><span className="block text-xs text-muted-foreground">Run missions, review evidence, and track approved work.</span></span>
        <span className="text-sm font-medium text-muted-foreground">{expanded ? 'Collapse' : 'Open'}</span>
      </button>}
      {expanded && <div className="space-y-5 border-t border-border p-4 sm:p-6">
        {catalog.isPending && <p role="status" className="text-sm text-muted-foreground">Checking workspace agent access…</p>}
        {catalog.isError && <p role="alert" className="text-sm text-destructive">{errorText(catalog.error)}</p>}
        {catalog.data && <>
          <div className={mode==='results'?'hidden':'grid gap-2 sm:grid-cols-2 xl:grid-cols-4'}>
            {catalog.data.map(item=><button key={item.id} type="button" onClick={()=>{setAgent(item.id);setIntent(item.id==='chief-of-staff'?'briefing':'analysis');}} aria-pressed={item.id===agent}
              className={'min-w-0 rounded-xl border p-3 text-left transition motion-reduce:transition-none '+(item.id===agent?'border-cyan-500/60 bg-cyan-500/5':'border-border hover:bg-muted')}>
              <span className="flex items-center gap-2 text-xs text-muted-foreground"><Radio className={'h-3 w-3 '+(item.available?'text-emerald-500':'text-muted-foreground')} /> {item.upgradeRequired?'Upgrade':item.available?'Available':'Not configured'}</span>
              <span className="mt-2 block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.reason ?? item.purpose}</span>
            </button>)}
          </div>
          {!!metrics.data?.length && <div className="overflow-x-auto rounded-xl border border-border p-3"><table className="min-w-[630px] w-full text-left text-xs"><caption className="pb-2 text-left text-xs text-muted-foreground">Recorded performance · Last 30 days</caption><thead><tr>{['Agent','Active','Completed','Failed','In review','Applied','Avg. time','Tokens','Cost'].map(label=><th scope="col" className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{metrics.data.map(m=><tr className="border-t border-border" key={m.agent}><th scope="row" className="p-2 font-medium">{catalog.data?.find(a=>a.id===m.agent)?.label ?? m.agent}</th><td>{m.active}</td><td>{m.completed}</td><td>{m.failed}</td><td>{m.awaiting}</td><td>{m.actions}</td><td>{m.mean_seconds===null?'—':m.mean_seconds+' s'}</td><td>{Number(m.tokens).toLocaleString()}</td><td>{m.cost_usd===null?'—':'$'+Number(m.cost_usd).toFixed(5)}</td></tr>)}</tbody></table></div>}
          <div className={mode==='results'?'grid gap-4':'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(230px,0.55fr)]'}>
            <form className={mode==='results'?'hidden':'space-y-3 rounded-xl border border-border p-4'} onSubmit={e=>{
              e.preventDefault(); const text=mission.trim(); const previous=create.variables;
              if (!selectedAgent) { setFormError('Choose an agent above first.'); return; }
              if (!available) { setFormError(selectedAgent.reason ?? 'This agent is not available right now.'); return; }
              if (text.length < 8) { setFormError('Describe the mission in at least 8 characters.'); return; }
              setFormError(null);
              const country=intent==='marketing' && marketCountry ? marketCountry : undefined;
              const key=previous && previous.mission===text && previous.agent===agent && previous.intent===intent && previous.marketCountry===country && create.isError
                ? previous.idempotencyKey : crypto.randomUUID();
              create.mutate({mission:text,agent,intent,idempotencyKey:key,marketCountry:country});
            }}>
              {selectedAgent?.upgradeRequired && <Link href="/billing" className="block rounded-lg bg-violet-600 px-3 py-2 text-center font-semibold text-white">Upgrade</Link>}
              <label htmlFor="agent-mission" className="text-sm font-semibold">New mission</label>
              {agent==='chief-of-staff' && <select aria-label="Mission type" value={intent} onChange={e=>setIntent(e.target.value)} className={btn}>
                <option value="briefing">Executive briefing</option><option value="goals">Draft goals and tasks</option><option value="marketing">Draft a marketing strategy</option>
              </select>}
              {intent==='marketing' && <select aria-label="Target country" className={btn} value={marketCountry} onChange={e=>setMarketCountry(e.target.value)}>
                <option value="">No country selected</option>{Object.entries({NG:'Nigeria',ZA:'South Africa',KE:'Kenya',GH:'Ghana',EG:'Egypt',GB:'United Kingdom',US:'United States',DE:'Germany',IN:'India',BR:'Brazil',CA:'Canada',AE:'United Arab Emirates'}).map(([id,label])=><option key={id} value={id}>{label}</option>)}
              </select>}
              <textarea id="agent-mission" value={mission} onChange={e=>{setMission(e.target.value); if (formError) setFormError(null);}} rows={3} maxLength={2000} aria-describedby="agent-mission-help"
                placeholder={intent==='goals'?'Propose measurable goals to address our biggest operational blockers.':agent==='financial-analyst'?'What can we do to improve profit this quarter? Compare our costs, revenue and margins and recommend the best moves.':'What should this agent investigate?'}
                className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <p id="agent-mission-help" className="text-xs text-muted-foreground">{selectedAgent ? `Runs ${selectedAgent.label} on the workspace AI model. At least 8 characters.` : 'Choose an agent above, then describe the mission.'}</p>
              <button type="submit" disabled={create.isPending} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {create.isPending?'Queueing…':'Run mission'}
              </button>
              {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
              {!formError && !available && selectedAgent?.reason && <p role="status" className="text-sm text-amber-600 dark:text-amber-400">{selectedAgent.reason}</p>}
              {create.isError && <p role="alert" className="text-sm text-destructive">{errorText(create.error)}</p>}
            </form>
            <div className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> My run history</h3>
                <select aria-label="Run status" value={filter} onChange={e=>{setFilter(e.target.value);setCursor(undefined);}} className={btn}>
                  <option value="">All statuses</option>{['queued','running','awaiting_approval','succeeded','applied','failed','cancelled'].map(s=><option key={s} value={s}>{phrase(s)}</option>)}
                </select></div>
              {history.isError && <p role="alert" className="mt-2 text-xs text-destructive">{errorText(history.error)}</p>}
              {!history.isPending && !history.data?.items.length && <p className="mt-3 text-xs text-muted-foreground">No matching runs.</p>}
              <div className="mt-2 max-h-56 overflow-y-auto">
                {history.data?.items.map(item=><button type="button" key={item.id} onClick={()=>{setReview(null);setReviewId(null);setRunId(item.id);rememberRun(item.id);onResult?.();action.reset();}}
                  aria-pressed={item.id===runId} className="flex w-full justify-between gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted aria-pressed:bg-muted">
                  <span>{phrase(item.agent.replaceAll('-',' '))}<span className="block text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span></span>
                  <span className="text-muted-foreground">{resultLabel(item.status)}</span>
                </button>)}
              </div>
              {cursor && <button type="button" className={btn} onClick={()=>setCursor(undefined)}>Newest</button>}
              {history.data?.nextCursor && <button type="button" className={btn} onClick={()=>setCursor(history.data!.nextCursor!)}>Older runs</button>}
            </div>
          </div>
        </>}
        {reviewId && !review && <button type="button" className={btn} disabled={action.isPending} onClick={()=>action.mutate({id:reviewId,op:'review'})}><ShieldCheck className="h-4 w-4" /> Open proposed goals for review</button>}
        {action.isError && <p role="alert" className="text-sm text-destructive">{errorText(action.error)}</p>}
        {runId && selected.isError && <p role="alert" className="text-sm text-destructive">{errorText(selected.error)}</p>}
        {mode==='results' && !runId && <p className="rounded-xl border border-dashed border-cyan-500/30 p-8 text-center text-sm text-muted-foreground">Select a saved run above to inspect its output, sources and approval state.</p>}
        {runId && selected.isPending && <p role="status">Loading saved result…</p>}
        {run && <article className="rounded-xl border border-border p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-cyan-500" /> {review ? 'Proposal review' : 'Mission result'}</h3>
            <p className="mt-1 text-xs font-semibold text-cyan-600">{resultLabel(run.status)}</p>
            {run.mission && <p className="mt-1 text-sm text-muted-foreground">{run.mission}</p>}</div>
            <span role="status" className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs capitalize">{phrase(run.status==='awaiting_approval' && ['rejected','withdrawn'].includes(run.decisionStatus ?? '') ? run.decisionStatus! : run.status)}</span></div>
          {run.usage && <p className="mt-2 text-xs text-muted-foreground">{run.usage.tokens.toLocaleString()} tokens · {run.usage.costUsd === null ? 'Cost not available' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:6}).format(run.usage.costUsd)}</p>}
          {run.errorCode && <p role="alert" className="mt-3 flex gap-2 text-sm text-destructive"><CircleAlert className="h-4 w-4" />{failures[run.errorCode] ?? failures.run_failed}</p>}
          {run.timeline && <ol className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground" aria-label="Execution timeline">
            {run.timeline.map(step=><li key={step.id} className="rounded-md border border-border px-2 py-1">{phrase(step.stage)} · {phrase(step.status)}</li>)}
          </ol>}
          {run.artifact && <>
            <p className="mt-3 text-xs text-muted-foreground">{run.status==='applied'?'Approved changes have been applied.':'AI analysis is a saved recommendation. Business changes require the applicable approval.'}</p>
            <CitedText text={run.artifact.summary} evidence={run.artifact.evidence} className="mt-4 whitespace-pre-wrap text-sm leading-6" />
            {(run.artifact.recommendations?.length ?? 0) > 0 && <Recommendations items={run.artifact.recommendations!} evidence={run.artifact.evidence} />}
            {(run.artifact.dataGaps?.length ?? 0) > 0 && <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
              <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-200">Data that would sharpen this analysis</h4>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs leading-5 text-foreground/80">{run.artifact.dataGaps!.map((gap, i) => <li key={i}>{gap}</li>)}</ul>
            </div>}
            {run.artifact.goals.length>0 && <div className="mt-4 grid gap-3 md:grid-cols-2">
              {run.artifact.goals.map((goal,i)=><div key={i} className="rounded-lg border border-border p-3"><h4 className="text-sm font-semibold">{goal.title}</h4>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{goal.rationale}</p><p className="mt-2 text-sm">{goal.metric}: {goal.target} {goal.unit} by {goal.dueDate}</p>
                <p className="text-xs text-muted-foreground">Baseline requires verification. Created objectives and tasks are shared in this workspace.</p>{goal.tasks.length>0 && <ul className="ml-4 mt-2 list-disc text-xs">{goal.tasks.map((task,j)=><li key={j}>{task}</li>)}</ul>}
              </div>)}
            </div>}
            {run.artifact.evidence.length>0 && <details className="mt-4 rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Evidence ({run.artifact.evidence.length})</summary><ol className="mt-2 grid gap-2 sm:grid-cols-2">{run.artifact.evidence.map((e,i)=><li key={e.key} id={'agent-evidence-'+i} className="scroll-mt-6 text-xs">
              <Link href={e.href} className="inline-flex items-center gap-1 font-semibold hover:underline"><span className="font-mono text-primary">{i+1}.</span> {e.title}<ArrowUpRight className="h-3 w-3" /></Link><p className="mt-0.5 leading-5 text-muted-foreground">{e.detail}</p></li>)}</ol></details>}
          </>}
          <div className="mt-4 flex flex-wrap gap-2">
            {run.artifact && <button type="button" className={btn} onClick={()=>{const file=new Blob([JSON.stringify({mission:run.mission,status:run.status,result:run.artifact},null,2)],{type:'application/json'});const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download='lumorius-result-'+run.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Download result</button>}
            {!review && (active(run.status) || (run.status==='awaiting_approval' && !run.decisionId)) && <button type="button" disabled={action.isPending} className={btn} onClick={()=>action.mutate({id:run.id,op:'cancel'})}>Cancel run</button>}
            {!review && run.status==='awaiting_approval' && (!run.decisionId || run.decisionStatus==='draft' || run.decisionStatus==='approved') &&
              <button type="button" disabled={action.isPending} className={btn} onClick={()=>action.mutate({id:run.id,op:run.decisionStatus==='approved'?'apply':'submit',version:run.artifactVersion})}><ShieldCheck className="h-4 w-4" /> {run.decisionStatus==='approved'?'Apply approved proposal':'Submit to Decisions'}</button>}
            {!review && run.status==='awaiting_approval' && run.decisionId && <button type="button" className={btn} onClick={()=>void selected.refetch()}>Refresh decision status</button>}
            {run.decisionId && <Link className={btn} href={'/decisions?decision='+run.decisionId}>Open decision <ArrowUpRight className="h-3 w-3" /></Link>}
          </div>
          {run.receipt && <ul className="mt-3 space-y-1">{run.receipt.map(item=><li key={item.objectiveId} className="flex flex-wrap gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-500" /><Link className="underline" href={'/founder-os#objective-'+item.objectiveId}>Objective</Link>{item.taskIds.map((id,i)=><Link className="underline" key={id} href={'/tasks?task='+id}>Task {i+1}</Link>)}</li>)}</ul>}
        </article>}
      </div>}
    </section>
  );
}
