'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Metrics={ id:string;name:string;runs:number;failed:number;active:number;median_seconds:number|null;p90_seconds:number|null;retried_steps:number };
type Process={ sampled:number; observed:number; variants:{path:string[]; runs:number; failed:number; median_seconds:number|null}[];
  bottlenecks:{step_index:number;step_type:string;observed:number;failed:number;retried:number;p90_seconds:number|null;median_wait_seconds:number|null}[] };
const duration=(seconds:number|null)=>seconds===null?'—':seconds>=60?(seconds/60).toFixed(1)+' min':Math.round(seconds)+' s';
export default function ProcessPerformance() {
  const [open,setOpen]=useState(false);
  const [selected,setSelected]=useState('');
  const detail=useQuery({queryKey:['workflow-process-detail',selected],enabled:open && !!selected,retry:false, queryFn:async()=>
    (await api.get<{data:Process}>('/workflows/'+selected+'/process')).data.data});
  const results=useQuery({queryKey:['workflow-process-health'],enabled:open,retry:false,queryFn:async()=> (await api.get('/workflows/performance')).data.data as Metrics[]});
  return <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="workflow-performance">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="workflow-performance" className="text-base font-semibold">Process performance</h2>
    <p className="text-xs text-muted-foreground">Observed workflow executions over the last 30 days.</p></div>
    <button type="button" aria-expanded={open} onClick={()=>setOpen(!open)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">{open?'Collapse':'Inspect bottlenecks'}</button></div>
    {open && results.isPending && <p role="status" className="mt-3 text-sm text-muted-foreground">Loading execution history…</p>}
    {open && results.isError && <p role="alert" className="mt-3 text-sm text-muted-foreground">Could not load process performance.</p>}
    {open && results.data?.length===0 && <p className="mt-3 text-sm text-muted-foreground">No workflows ran during this period.</p>}
    {open && !!results.data?.length && <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr>{['Workflow','Runs','Failed','In progress','Median','90th percentile','Steps retried'].map(label=><th className="p-2" scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{results.data.map(row=><tr className="border-t border-border" key={row.id}><th className="p-2 font-semibold" scope="row"><button type="button" aria-pressed={selected===row.id} className="text-left text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-300" onClick={()=>setSelected(selected===row.id?'':row.id)}>{row.name}</button></th>
      <td className="p-2">{row.runs}</td><td className="p-2">{row.failed}</td><td className="p-2">{row.active}</td><td className="p-2">{duration(row.median_seconds)}</td>
      <td className="p-2">{duration(row.p90_seconds)}</td><td className="p-2">{row.retried_steps}</td></tr>)}</tbody></table>
      <p className="mt-2 text-xs text-muted-foreground">Select a workflow to see its observed paths and slowest steps. Elapsed time uses executions with an end timestamp. The table excludes activity outside Lumorius.</p>
    </div>}
    {open && selected && detail.isPending && <p role="status" className="mt-4 text-sm text-muted-foreground">Reading recorded steps…</p>}
    {open && selected && detail.isError && <p role="alert" className="mt-4 text-sm text-destructive">Could not load recorded steps.</p>}
    {open && selected && detail.data && <div className="mt-4 space-y-4 rounded-xl border border-border p-4">
      <div><h3 className="font-semibold">{results.data?.find(row=>row.id===selected)?.name ?? 'Workflow'} · Process explorer</h3>
        <p className="text-xs text-muted-foreground">{detail.data.observed} of {detail.data.sampled} sampled runs had recorded steps. Includes partial paths when a run stopped early. Latest 1,000 runs in the last 30 days.</p>
      </div>
      {!detail.data.observed ? <p className="text-sm text-muted-foreground">This workflow has no recorded steps in the sample.</p> : <>
        <div><h4 className="mb-2 text-sm font-semibold">Most frequent observed paths</h4>
          <ul className="grid gap-2 lg:grid-cols-2">{detail.data.variants.map(row=><li key={JSON.stringify(row.path)} className="rounded-lg border border-border p-3">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs">{row.path.map((step,i)=><li key={i} className="rounded bg-muted px-2 py-1">{i+1}. {step.replaceAll('_',' ')}</li>)}</ol>
            <p className="mt-2 text-xs text-muted-foreground">{row.runs} runs · {row.failed} failed · median {duration(row.median_seconds)}</p>
          </li>)}</ul>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[570px] text-left text-sm"><caption className="mb-2 text-left text-sm font-semibold">Step duration and wait</caption>
          <thead><tr>{['Step','Observations','Failed','Retried','90th percentile duration','Median preceding wait'].map(h=><th key={h} scope="col" className="p-2 text-xs text-muted-foreground">{h}</th>)}</tr></thead>
          <tbody>{detail.data.bottlenecks.map(row=><tr key={row.step_index+':'+row.step_type} className="border-t border-border">
            <th scope="row" className="p-2 font-medium">{row.step_index+1}. {row.step_type.replaceAll('_',' ')}</th>
            <td className="p-2">{row.observed}</td><td className="p-2">{row.failed}</td><td className="p-2">{row.retried}</td><td className="p-2">{duration(row.p90_seconds)}</td><td className="p-2">{duration(row.median_wait_seconds)}</td>
          </tr>)}</tbody>
        </table>
        <p className="text-xs text-muted-foreground">Wait is measured from the previous recorded step’s end to this step’s start. Steps without timestamps do not contribute to timing.</p></div>
      </>}
    </div>}
  </section>;
}
