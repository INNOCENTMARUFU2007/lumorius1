'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertCircle, CheckCircle2, Loader2, PlugZap, Puzzle, RefreshCw, Search,
  ShieldCheck, Unplug, CloudDownload, Settings2, X, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

type IntegrationStatus = 'connected' | 'not_connected' | 'setup_required' | 'managed' | 'error';
type AuthMode = 'oauth' | 'api_key' | 'webhook';
interface IntegrationItem {
  id: string;
  name: string;
  category: string;
  description: string;
  emoji: string;
  status: IntegrationStatus;
  statusText: string;
  accountEmail?: string | null;
  lastSyncedAt?: string | null;
  canManage: boolean;
  canConnect: boolean;
  canConfigure: boolean;
  canDisconnect: boolean;
  canSync: boolean;
  canTest?: boolean;
  callbackUrl?: string;
  authMode: AuthMode;
  platformOnly?: boolean;
  requiresPaidPlan?: boolean;
}

function monogram(name: string) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

function payload<T>(response: any): T {
  return (response?.data?.data ?? response?.data) as T;
}
function errorText(error: any) {
  const message = error?.response?.data?.message ?? error?.message;
  return typeof message === 'string' ? message : 'The integration request failed. Check provider setup and API logs.';
}
function statusStyle(status: IntegrationStatus) {
  switch (status) {
    case 'connected': return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500';
    case 'managed': return 'border-blue-500/30 bg-blue-500/10 text-blue-500';
    case 'setup_required': return 'border-amber-500/30 bg-amber-500/10 text-amber-500';
    case 'error': return 'border-red-500/30 bg-red-500/10 text-red-500';
    default: return 'border-border bg-muted/40 text-muted-foreground';
  }
}
function statusLabel(item: IntegrationItem) {
  if (item.status === 'connected') return 'Connected';
  if (item.status === 'managed') return 'Platform managed';
  if (item.status === 'setup_required') return 'Setup required';
  if (item.status === 'error') return 'Needs attention';
  return 'Not connected';
}

export default function IntegrationsPage() {
  const { user, isLoading } = useAuth();
  if (!user) return <p className="p-6 text-sm text-muted-foreground">{isLoading ? 'Loading integrations…' : 'Sign in to manage integrations.'}</p>;
  const account = `${user.organizationId}/${user.id}`;
  return <IntegrationWorkspace key={account} account={account} />;
}

type SyncReceipt = { provider: string; fetched: number; imported: number; skipped: number; unsupported: number };
type Credentials = { apiKey?: string; appKey?: string; webhookUrl?: string };

function IntegrationWorkspace({ account }: { account: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('all');
  const [setup, setSetup] = useState<IntegrationItem | null>(null);
  const [credentials, setCredentials] = useState<Credentials>({});
  const [receipt, setReceipt] = useState<SyncReceipt | null>(null);

  const integrationsQuery = useQuery<IntegrationItem[]>({
    queryKey: ['integrations', account],
    queryFn: async () => {
      const response = await api.get('/integrations');
      const result = payload<IntegrationItem[]>(response);
      if (!Array.isArray(result)) throw new Error('The integrations API returned an unexpected response.');
      return result;
    },
    retry: 1,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get('integrationStatus');
    const provider = url.searchParams.get('provider');
    if (status === 'connected') {
      toast.success(`${provider ? provider.replaceAll('-', ' ') : 'Integration'} connected. Use Sync now to import available content.`);
      qc.invalidateQueries({ queryKey: ['integrations'] });
      url.searchParams.delete('integrationStatus');
      url.searchParams.delete('provider');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } else if (status === 'error') {
      toast.error('Connection failed. Check the provider credentials, redirect URI and API logs.');
      url.searchParams.delete('integrationStatus');
      url.searchParams.delete('provider');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [qc]);

  const connectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await api.post(`/integrations/${provider}/connect`);
      const result = payload<{ authUrl?: string }>(response);
      if (!result?.authUrl || typeof result.authUrl !== 'string') throw new Error('The API did not return an OAuth authorisation URL.');
      return result;
    },
    onSuccess: (result) => window.location.assign(result.authUrl!),
    onError: (error) => toast.error(errorText(error)),
  });

  const configureMutation = useMutation({
    mutationFn: async (input: { provider: string; credentials: { apiKey?: string; appKey?: string; webhookUrl?: string } }) => {
      await api.post(`/integrations/${input.provider}/configure`, input.credentials);
      return input.provider;
    },
    onSuccess: (provider) => {
      toast.success(`${provider} configured securely.`);
      setSetup(null);
      setCredentials({});
      qc.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const syncMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await api.post(`/integrations/${provider}/sync`);
      return payload<SyncReceipt>(response);
    },
    onSuccess: (result) => {
      setReceipt(result);
      toast.success(`${result.imported} imported, ${result.skipped} already imported, ${result.unsupported} unsupported. ${result.fetched} source items checked.`);
      qc.invalidateQueries({ queryKey: ['integrations'] });
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (error) => { toast.error(errorText(error)); void qc.invalidateQueries({ queryKey: ['integrations'] }); },
  });

  const testMutation = useMutation({
    mutationFn: (provider: string) => api.post('/integrations/' + encodeURIComponent(provider) + '/test'),
    onSuccess: () => toast.success('The webhook accepted the test event.'),
    onError: (error) => toast.error(errorText(error)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      await api.delete(`/integrations/${provider}`);
      return provider;
    },
    onSuccess: (provider) => {
      toast.success(`${provider.replaceAll('-', ' ')} disconnected from Lumorius.`);
      qc.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const configure = (item: IntegrationItem) => { setCredentials({}); setSetup(item); };

  const items = integrationsQuery.data ?? [];
  const categories = useMemo(() => ['All', ...Array.from(new Set(items.map((item) => item.category)))], [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(q);
    return matchesSearch && (category === 'All' || item.category === category) && (status === 'all' || item.status === status);
  }), [items, search, category, status]);
  const connectedCount = items.filter((item) => item.status === 'connected').length;
  const busy = connectMutation.isPending || configureMutation.isPending || syncMutation.isPending || disconnectMutation.isPending || testMutation.isPending;

  return (
    <div className="mx-auto max-w-[1460px] space-y-5 pb-10">
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
            <p className="mt-1 text-sm text-muted-foreground">Connect source accounts, sync documents, and test outbound webhooks.</p>
          </div>
        </div>
        <button type="button" onClick={() => void integrationsQuery.refetch()} disabled={integrationsQuery.isFetching} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${integrationsQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {integrationsQuery.data && <section aria-label="Connection summary" className="grid grid-cols-3 gap-2">
        {[
          { label: 'Connected', key: 'connected', count: connectedCount },
          { label: 'Setup required', key: 'setup_required', count: items.filter((item) => item.status === 'setup_required').length },
          { label: 'Needs attention', key: 'error', count: items.filter((item) => item.status === 'error').length },
        ].map((item) => <button key={item.key} type="button" aria-pressed={status === item.key} onClick={() => setStatus(status === item.key ? 'all' : item.key)} className="rounded-xl border border-border bg-card p-3 text-left hover:border-brand-500/40 aria-pressed:border-brand-500">
          <span className="block text-xl font-semibold tabular-nums">{item.count}</span><span className="text-xs text-muted-foreground">{item.label}</span>
        </button>)}
      </section>}
      {receipt && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-teal-500/25 bg-teal-500/5 p-4">
        <div><p className="text-sm font-semibold capitalize">{receipt.provider.replace(/-/g, ' ')} sync result</p><p className="mt-1 text-xs text-muted-foreground">{receipt.fetched} checked · {receipt.imported} queued for indexing · {receipt.skipped} skipped · {receipt.unsupported} unsupported</p></div>
        <button type="button" onClick={() => setReceipt(null)} aria-label="Dismiss sync result"><X className="h-4 w-4" /></button>
      </div>}
      {setup && <form role="dialog" aria-label={`Configure ${setup.name}`} onSubmit={(event) => {
        event.preventDefault();
        if (!busy) configureMutation.mutate({ provider: setup.id, credentials });
      }} className="rounded-2xl border border-brand-500/30 bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">Configure {setup.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{setup.authMode === 'webhook' ? 'Paste the HTTPS hook URL from your receiving workflow.' : 'Enter the API key and application key for your Datadog site.'}</p></div>
          <button type="button" onClick={() => { setSetup(null); setCredentials({}); }} disabled={busy} aria-label="Close setup" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4" /></button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(setup.authMode === 'webhook' ? [['webhookUrl', 'Webhook URL']] : [['apiKey', 'API key'], ['appKey', 'Application key']]).map(([key, label]) => (
            <label key={key} className="block text-xs font-medium">{label}
              <input type="password" required autoComplete="off" maxLength={2048} value={credentials[key as keyof typeof credentials] ?? ''} onChange={(event) => setCredentials({ ...credentials, [key]: event.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </label>
          ))}
        </div>
        <button type="submit" disabled={busy} className="mt-4 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{configureMutation.isPending ? 'Saving…' : 'Save connection'}</button>
      </form>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative block max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="Search integrations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search integrations…" className="w-full rounded-lg border border-border bg-muted/30 py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-violet-500/30" />
        </label>
        <div className="flex flex-wrap gap-1" aria-label="Integration categories">
          {categories.map((item) => (
            <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-lg px-3 py-2 text-xs font-medium transition ${category === item ? 'bg-violet-600 text-white' : 'border border-border text-muted-foreground hover:bg-muted'}`}>{item}</button>
          ))}
        </div>
      </div>

      {integrationsQuery.isLoading && <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading integrations…</div>}
      {integrationsQuery.isError && <div className="rounded-xl border border-red-500/30 p-5 text-sm"><div className="flex items-center gap-2 font-medium"><AlertCircle className="h-5 w-5 text-red-500" /> Integrations could not be loaded</div><p className="mt-2 text-muted-foreground">{errorText(integrationsQuery.error)}</p><button type="button" onClick={() => void integrationsQuery.refetch()} className="mt-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">Try again</button></div>}

      {!integrationsQuery.isLoading && !integrationsQuery.isError && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item, index) => {
            const connectPending = connectMutation.isPending && connectMutation.variables === item.id;
            const syncPending = syncMutation.isPending && syncMutation.variables === item.id;
            const disconnectPending = disconnectMutation.isPending && disconnectMutation.variables === item.id;
            return (
              <motion.article key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.015 }} className="flex min-h-[245px] flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3"><div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 font-mono text-xs font-semibold text-foreground/80">{monogram(item.name)}</div><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{item.name}</h2><p className="mt-0.5 text-xs text-muted-foreground">{item.category}{item.requiresPaidPlan ? ' · Paid plans' : ''}</p></div></div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${statusStyle(item.status)}`}>{statusLabel(item)}</span>
                </div>
                <p className="mt-3 flex-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                  {item.status === 'connected' || item.status === 'managed' ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> : item.status === 'error' ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" /> : <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span className="break-words">{item.accountEmail ? `${item.accountEmail} · ` : ''}{item.statusText}</span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2">
                  {item.canConnect && <button type="button" disabled={busy} onClick={() => connectMutation.mutate(item.id)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">{connectPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}{connectPending ? 'Starting secure connection…' : 'Connect account'}</button>}
                  {item.canConfigure && item.status !== 'connected' && <button type="button" disabled={busy} onClick={() => configure(item)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Settings2 className="h-3.5 w-3.5" /> Configure integration</button>}
                  {item.canSync && <button type="button" disabled={busy} onClick={() => syncMutation.mutate(item.id)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50">{syncPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}{syncPending ? 'Syncing into Company Brain…' : 'Sync now'}</button>}
                  {item.canTest && <button type="button" disabled={busy} onClick={() => testMutation.mutate(item.id)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-40">
                    <Send className="h-3.5 w-3.5" /> {testMutation.isPending && testMutation.variables === item.id ? 'Sending test…' : 'Send test event'}
                  </button>}
                  {item.callbackUrl && item.status === 'setup_required' && <details className="rounded-lg border border-border p-2 text-xs"><summary className="cursor-pointer">OAuth setup details</summary>
                    <p className="mt-1 text-muted-foreground">Register this callback URL with the provider:</p><code className="mt-1 block break-all">{item.callbackUrl}</code></details>}
                  {item.canDisconnect && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Disconnect ${item.name}?`)) disconnectMutation.mutate(item.id); }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-red-500/40 hover:text-red-500 disabled:opacity-50">{disconnectPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}{disconnectPending ? 'Removing…' : 'Disconnect'}</button>}
                  {item.status === 'managed' && <span className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-blue-500/30 px-3 py-2 text-xs text-blue-500"><ShieldCheck className="h-3.5 w-3.5" /> Platform managed</span>}
                  {!item.canManage && <p className="rounded-lg border border-border px-3 py-2 text-center text-xs text-muted-foreground">Owner/admin access required</p>}
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
      {!integrationsQuery.isLoading && !integrationsQuery.isError && filtered.length === 0 && <div className="py-16 text-center text-muted-foreground"><Puzzle className="mx-auto mb-3 h-10 w-10 opacity-20" /><p>No integrations match the current search.</p></div>}
      <p className="text-xs leading-relaxed text-muted-foreground">Sync imports a bounded set of source records, converts supported content to documents, and queues it for indexing. Repeated syncs skip source records already imported. Removing a connection does not revoke access from the provider's own security page.</p>
    </div>
  );
}
