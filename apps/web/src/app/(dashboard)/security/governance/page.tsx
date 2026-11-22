'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, FileCheck, KeyRound, LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import api from '@/lib/api';
import { PageHeader } from '@/components/ui/primitives';

type Member = { id: string; name: string; email: string; role: string; is_active: boolean; mfa_enabled: boolean; last_login_at: string | null; sessions: number; api_keys: number };
type Review = { members: Member[]; hasMore: boolean; usage: { feature: string; operations: number; tokens: string }[] };
type Audit = { id: string; action: string; user_name: string | null; resource_type: string | null; resource_id: string | null; created_at: string };
type Policy = { resource_type: string; retention_days: number };
type Receipt = { status: string; storage_objects_pending: number; storage_objects_retrying: number; processed_at: string | null; failure_reason?: string };
type Deletion = { id?: string; status: string; scheduled_at?: string; scheduledAt?: string; failure_reason?: string; failureReason?: string };
const button = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40';
const panel = 'space-y-4 rounded-xl border border-border bg-card p-5';
const readable = (value: string) => value.replaceAll('_', ' ');
const formatted = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

async function fetchData<T>(path: string, params?: object) {
  return (await api.get<{ data: T }>(path, { params })).data.data;
}

function errorText(error: unknown) {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' ? message : 'The request failed. Try again.';
}

function saveJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Status({ value }: { value?: Deletion }) {
  if (!value) return null;
  return <div className="space-y-1 text-sm"><p className="capitalize">Status · {readable(value.status)}</p>{(value.scheduled_at || value.scheduledAt) && <p className="text-muted-foreground">Scheduled {formatted(value.scheduled_at ?? value.scheduledAt)}</p>}{(value.failure_reason || value.failureReason) && <p role="alert" className="text-destructive">{value.failure_reason ?? value.failureReason}</p>}</div>;
}

function RetentionForm({ type, days, pending, onSave }: { type: string; days?: number; pending: boolean; onSave: (days: number) => void }) {
  const [value, setValue] = useState(days?.toString() ?? '');
  return <form className="flex flex-wrap items-end gap-2 border-t border-border pt-3" onSubmit={(event) => { event.preventDefault(); onSave(Number(value)); }}>
    <label className="text-xs font-medium capitalize">{readable(type)}
      <input required type="number" min="1" max="3650" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Days" className={button + ' mt-1 block w-28 text-left'} />
    </label>
    <button className={button} disabled={pending} type="submit">Save</button>
    <span className="pb-2 text-xs text-muted-foreground">{days ? days + ' days configured' : 'No policy configured'}</span>
  </form>;
}

export default function GovernancePage() {
  const { user, isLoading } = useAuth();
  const account = [user?.organizationId, user?.id];
  const admin = Boolean(user?.organizationId) && ['owner', 'admin'].includes(user?.role ?? '');
  const owner = Boolean(user?.organizationId) && user?.role === 'owner';
  const cache = useQueryClient();
  const [peoplePage, setPeople] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [resource, setResource] = useState('tasks');
  const [receiptInput, setReceiptInput] = useState('');
  const [receiptId, setReceiptId] = useState('');
  const [exportCursor, setExportCursor] = useState<string | null>(null);
  const prefix = ['workspace-governance', ...account];
  const review = useQuery({ queryKey: [...prefix, 'review', peoplePage], enabled: admin, queryFn: () => fetchData<Review>('/security/access-review', { page: peoplePage }) });
  const audit = useQuery({ queryKey: [...prefix, 'audit', auditPage, filter], enabled: admin, queryFn: () => fetchData<Audit[]>('/security/audit-logs', { limit: 25, page: auditPage, action: filter || undefined }) });
  const retention = useQuery({ queryKey: [...prefix, 'retention'], enabled: admin, queryFn: () => fetchData<Policy[]>('/gdpr/retention') });
  const personal = useQuery({ queryKey: [...prefix, 'personal'], enabled: Boolean(user), queryFn: () => fetchData<Deletion>('/gdpr/deletion-status') });
  const organization = useQuery({ queryKey: [...prefix, 'organization'], enabled: admin, queryFn: () => fetchData<Deletion>('/gdpr/organization/deletion-status') });
  const receipt = useQuery({
    queryKey: [...prefix, 'receipt', receiptId], enabled: Boolean(user && receiptId), retry: false,
    queryFn: () => fetchData<Receipt>('/gdpr/organization/deletion-requests/' + receiptId),
  });
  const change = useMutation({
    mutationFn: async (options: { path: string; method: 'post' | 'delete' | 'put'; body?: object }) => {
      if (options.method === 'delete') return api.delete(options.path);
      return api[options.method](options.path, options.body);
    },
    onSuccess: () => { toast.success('Changes saved'); void cache.invalidateQueries({ queryKey: prefix }); },
    onError: (error) => toast.error(errorText(error)),
  });
  const download = useMutation({
    mutationFn: async (organizationExport: boolean) => {
      if (!organizationExport) {
        const response = await api.get('/gdpr/export');
        saveJson(response.data, 'lumorius-account-export.json');
        return;
      }
      const bundle = await fetchData<{ nextCursor: string | null }>('/gdpr/organization/export', { resource, after: exportCursor ?? undefined });
      saveJson(bundle, 'lumorius-' + resource + '-' + (exportCursor ?? 'first') + '.json');
      setExportCursor(bundle.nextCursor);
    },
    onSuccess: () => { toast.success('Export downloaded'); void cache.invalidateQueries({ queryKey: [...prefix, 'audit'] }); },
    onError: (error) => toast.error(errorText(error)),
  });

  return <main className="mx-auto w-full max-w-[1440px] space-y-5">
    <Link className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" href={admin ? '/security' : '/settings'}><ArrowLeft className="h-3.5 w-3.5" /> {admin ? 'Security Centre' : 'Settings'}</Link>
    <PageHeader
      hero
      icon={ShieldCheck}
      title={admin ? 'Security & Governance' : 'Privacy & Data'}
      description={admin ? 'Review workspace access, audit events, and data lifecycle requests.' : 'Export your account data or manage a deletion request.'}
    />
    {(isLoading || (user && personal.isPending)) && <p role="status" className="text-sm text-muted-foreground">Loading security records…</p>}
    {[review, audit, retention, personal, organization].some((query) => query.isError) && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">Some governance records could not be loaded. Refresh to retry.</p>}

    {admin && <>
      <div className="flex flex-wrap gap-2">
        <Link className={button} href="/security"><KeyRound className="h-4 w-4" /> API keys and sessions</Link>
        <Link className={button} href="/team"><Users className="h-4 w-4" /> Invitations and roles</Link>
        <Link className={button} href="/decisions"><ShieldCheck className="h-4 w-4" /> Decision governance</Link>
      </div>
      <section className={panel}>
        <h2 className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4" /> Access review</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[670px] text-left text-sm">
          <thead className="bg-muted text-xs text-muted-foreground"><tr>{['Teammate', 'Role', 'MFA', 'Sessions', 'API keys', 'Last sign-in'].map((label) => <th key={label} className="p-2.5">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{review.data?.members.map((member) => <tr key={member.id}><td className="p-2.5 font-medium">{member.name} {!member.is_active && <span className="text-xs text-muted-foreground">· Inactive</span>}<div className="text-xs text-muted-foreground">{member.email}</div></td><td className="p-2.5 capitalize">{member.role}</td><td className="p-2.5">{member.mfa_enabled ? 'Enabled' : 'Off'}</td><td className="p-2.5 tabular-nums">{member.sessions}</td><td className="p-2.5 tabular-nums">{member.api_keys}</td><td className="p-2.5">{formatted(member.last_login_at)}</td></tr>)}</tbody>
        </table></div>
        {review.data?.members.length === 0 && <p className="text-sm text-muted-foreground">No users on this page.</p>}
        <div className="flex items-center gap-2"><button className={button} disabled={peoplePage === 1} onClick={() => setPeople(peoplePage - 1)}>Previous</button><span className="text-sm">Page {peoplePage}</span><button className={button} disabled={!review.data?.hasMore} onClick={() => setPeople(peoplePage + 1)}>Next</button></div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><FileCheck className="h-4 w-4" /> Audit activity</h2><label className="text-xs text-muted-foreground">Event <select className={button} value={filter} onChange={(event) => { setFilter(event.target.value); setAuditPage(1); }}><option value="">All</option><option value="login">Sign-in</option><option value="role">Role changes</option><option value="api_key">API keys</option><option value="integration">Integrations</option><option value="ai.">AI</option><option value="workflow">Workflows</option><option value="gdpr.">Data lifecycle</option></select></label></div>
          <ol className="divide-y divide-border">{audit.data?.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"><div><p className="break-all font-medium">{entry.action}</p><p className="text-xs text-muted-foreground">{entry.user_name ?? 'System'}{entry.resource_type ? ' · ' + readable(entry.resource_type) : ''}</p></div><time className="text-xs text-muted-foreground" dateTime={entry.created_at}>{formatted(entry.created_at)}</time></li>)}</ol>
          {audit.data?.length === 0 && <p className="text-sm text-muted-foreground">No events match.</p>}
          <div className="flex items-center gap-2"><button className={button} disabled={auditPage === 1} onClick={() => setAuditPage(auditPage - 1)}>Previous</button><span className="text-sm">Page {auditPage}</span><button className={button} disabled={audit.data?.length !== 25} onClick={() => setAuditPage(auditPage + 1)}>Next</button></div>
        </section>
        <section className={panel}>
          <h2 className="font-semibold">AI usage · 30 days</h2>
          {review.data?.usage.length === 0 && <p className="text-sm text-muted-foreground">No metered AI operations.</p>}
          <dl className="divide-y divide-border">{review.data?.usage.map((item) => <div key={item.feature} className="py-2.5 text-sm"><dt className="capitalize">{readable(item.feature)}</dt><dd className="text-xs tabular-nums text-muted-foreground">{item.operations.toLocaleString()} operations · {Number(item.tokens).toLocaleString()} reported tokens</dd></div>)}</dl>
        </section>
      </div>

      <section className={panel}>
        <h2 className="flex items-center gap-2 font-semibold"><LockKeyhole className="h-4 w-4" /> Retention</h2>
        <p className="text-sm text-muted-foreground">The scheduled cleanup removes eligible audit entries and transcript text. Meeting summaries and backup copies follow their own retention processes.</p>
        {retention.data && ['audit_logs', 'meeting_transcripts'].map((type) => {
          const days = retention.data.find((policy) => policy.resource_type === type)?.retention_days;
          return <RetentionForm key={type + ':' + days} type={type} days={days} pending={change.isPending} onSave={(retentionDays) => change.mutate({ method: 'put', path: '/gdpr/retention/' + type, body: { retentionDays } })} />;
        })}
      </section>

      <section className={panel}>
        <h2 className="font-semibold">Organization data</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">Export dataset
            <select className={button + ' mt-1 flex'} value={resource} disabled={download.isPending} onChange={(event) => { setResource(event.target.value); setExportCursor(null); }}>
              {['tasks', 'projects', 'documents', 'meetings', 'objectives', 'knowledge_decisions'].map((value) => <option key={value} value={value}>{readable(value)}</option>)}
            </select>
          </label>
          <button className={button} disabled={download.isPending} onClick={() => download.mutate(true)}><Download className="h-4 w-4" /> {exportCursor ? 'Download next page' : 'Download JSON'}</button>
        </div>
        <Status value={organization.data} />
        {owner && organization.data && ['none', 'failed', 'cancelled'].includes(organization.data.status) && <button className={button + ' text-destructive'} disabled={change.isPending} onClick={() => { if (window.prompt('Type DELETE to schedule organization deletion in 30 days.') === 'DELETE') change.mutate({ method: 'post', path: '/gdpr/organization/request-deletion' }); }}>Request organization deletion</button>}
        {organization.data?.status === 'requested' && <button className={button} disabled={change.isPending} onClick={() => change.mutate({ method: 'delete', path: '/gdpr/organization/cancel-deletion' })}>Cancel organization deletion</button>}
        {organization.data?.id && <p className="break-all text-xs text-muted-foreground">Request ID {organization.data.id}. Save this ID to check storage cleanup after the organization is removed.</p>}
      </section>
    </>}

    {user && <section className={panel}>
      <details>
        <summary className="cursor-pointer text-sm font-semibold">Check an organization deletion receipt</summary>
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => {
          event.preventDefault();
          const id = receiptInput.trim();
          if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) { toast.error('Enter a valid request ID.'); return; }
          if (id === receiptId) void receipt.refetch();
          else setReceiptId(id);
        }}>
          <label className="text-xs text-muted-foreground">Request ID
            <input required value={receiptInput} onChange={(event) => setReceiptInput(event.target.value)} className={button + ' mt-1 block min-w-64 text-left text-foreground'} />
          </label>
          <button className={button} disabled={receipt.isFetching} type="submit">Check status</button>
        </form>
        {receipt.isError && <p role="alert" className="mt-2 text-sm text-destructive">{errorText(receipt.error)}</p>}
        {receipt.data && <div className="mt-3 space-y-1 text-sm">
          <Status value={receipt.data} />
          {receipt.data.processed_at && <p className="text-muted-foreground">Live records processed {formatted(receipt.data.processed_at)}</p>}
          <p className="text-muted-foreground">Storage objects queued {receipt.data.storage_objects_pending} · Retrying {receipt.data.storage_objects_retrying}</p>
        </div>}
      </details>
    </section>}

    {user && <section className={panel}>
      <h2 className="font-semibold">Personal data</h2>
      <Status value={personal.data} />
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={download.isPending} onClick={() => download.mutate(false)}><Download className="h-4 w-4" /> Export my data</button>
        {personal.data && ['none', 'failed', 'cancelled'].includes(personal.data.status) && <button className={button + ' text-destructive'} disabled={change.isPending} onClick={() => { if (window.confirm('Schedule deletion of your account in 30 days?')) change.mutate({ method: 'post', path: '/gdpr/request-deletion' }); }}>Request account deletion</button>}
        {personal.data?.status === 'requested' && <button className={button} disabled={change.isPending} onClick={() => change.mutate({ method: 'delete', path: '/gdpr/cancel-deletion' })}>Cancel account deletion</button>}
      </div>
    </section>}
  </main>;
}
