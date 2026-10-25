'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertCircle, CheckCircle2, Loader2, PlugZap, Puzzle, RefreshCw, Search,
  ShieldCheck, Unplug,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

type IntegrationStatus = 'connected' | 'not_connected' | 'setup_required' | 'coming_soon' | 'managed';
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
  canDisconnect: boolean;
  platformOnly?: boolean;
}

function payload<T>(response: any): T {
  return (response?.data?.data ?? response?.data) as T;
}
function errorText(error: any) {
  const message = error?.response?.data?.message ?? error?.message;
  return typeof message === 'string' ? message : 'The integration request failed. Check the API logs and provider setup.';
}
function statusStyle(status: IntegrationStatus) {
  switch (status) {
    case 'connected': return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500';
    case 'managed': return 'border-blue-500/30 bg-blue-500/10 text-blue-500';
    case 'setup_required': return 'border-amber-500/30 bg-amber-500/10 text-amber-500';
    case 'coming_soon': return 'border-border bg-muted/40 text-muted-foreground';
    default: return 'border-border bg-muted/40 text-muted-foreground';
  }
}
function statusLabel(item: IntegrationItem) {
  if (item.status === 'connected') return 'Connected';
  if (item.status === 'managed') return 'Platform managed';
  if (item.status === 'setup_required') return 'Setup required';
  if (item.status === 'coming_soon') return 'Coming soon';
  return 'Not connected';
}

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const integrationsQuery = useQuery<IntegrationItem[]>({
    queryKey: ['integrations'],
    queryFn: async () => {
      const response = await api.get('/integrations');
      const result = payload<IntegrationItem[]>(response);
      if (!Array.isArray(result)) throw new Error('The integrations API returned an unexpected response.');
      return result;
    },
    retry: 1,
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get('integrationStatus');
    const provider = url.searchParams.get('provider');
    if (status === 'connected') {
      toast.success(`${provider ? provider.replaceAll('-', ' ') : 'Integration'} connected. Content sync is not enabled yet.`);
      qc.invalidateQueries({ queryKey: ['integrations'] });
      url.searchParams.delete('integrationStatus');
      url.searchParams.delete('provider');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } else if (status === 'error') {
      toast.error('The provider connection was not completed. Check OAuth credentials, redirect URI and API logs.');
      url.searchParams.delete('integrationStatus');
      url.searchParams.delete('provider');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [qc]);

  const connectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await api.post(`/integrations/${provider}/connect`);
      const result = payload<{ authUrl?: string }>(response);
      if (!result?.authUrl || typeof result.authUrl !== 'string') {
        throw new Error('The API did not return an OAuth authorisation URL.');
      }
      return result;
    },
    onSuccess: (result) => window.location.assign(result.authUrl!),
    onError: (error) => toast.error(errorText(error)),
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

  const items = integrationsQuery.data ?? [];
  const categories = useMemo(() => ['All', ...Array.from(new Set(items.map((i) => i.category)))], [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(q);
    return matchesSearch && (category === 'All' || item.category === category);
  }), [items, search, category]);
  const connectedCount = items.filter((item) => item.status === 'connected').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-500/10 p-2.5"><Puzzle className="h-6 w-6 text-indigo-500" /></div>
          <div>
            <h1 className="text-2xl font-bold">Integrations</h1>
            <p className="text-sm text-muted-foreground">{connectedCount} connected account(s). Connections are organisation-scoped.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void integrationsQuery.refetch()}
          disabled={integrationsQuery.isFetching}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${integrationsQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative block max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Search integrations"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search integrationsâ€¦"
            className="w-full rounded-lg border border-border bg-muted/30 py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
          />
        </label>
        <div className="flex flex-wrap gap-1" aria-label="Integration categories">
          {categories.map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => setCategory(value)}
              aria-pressed={category === value}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${category === value ? 'bg-violet-600 text-white' : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >{value}</button>
          ))}
        </div>
      </div>

      {integrationsQuery.isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading integrationsâ€¦</div>
      )}
      {integrationsQuery.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-5 w-5 text-red-500" /> Integrations could not be loaded</div>
          <p className="mt-2 text-sm text-muted-foreground">{errorText(integrationsQuery.error)}</p>
          <button type="button" onClick={() => void integrationsQuery.refetch()} className="mt-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">Try again</button>
        </div>
      )}

      {!integrationsQuery.isLoading && !integrationsQuery.isError && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => {
            const connectPending = connectMutation.isPending && connectMutation.variables === item.id;
            const disconnectPending = disconnectMutation.isPending && disconnectMutation.variables === item.id;
            return (
              <motion.article
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex min-h-64 flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span aria-hidden="true" className="text-2xl">{item.emoji}</span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold leading-5">{item.name}</h2>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{item.category}</p>
                    </div>
                  </div>
                  {item.status === 'connected' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : item.status === 'managed' ? <ShieldCheck className="h-4 w-4 shrink-0 text-blue-500" /> : null}
                </div>
                <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                <div className="space-y-1.5">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-medium ${statusStyle(item.status)}`}>{statusLabel(item)}</span>
                  <p className="min-h-8 text-[11px] leading-relaxed text-muted-foreground">{item.accountEmail ? `Account: ${item.accountEmail}. ` : ''}{item.statusText}</p>
                </div>
                {item.canConnect ? (
                  <button
                    type="button"
                    disabled={connectMutation.isPending || disconnectMutation.isPending}
                    onClick={() => connectMutation.mutate(item.id)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >{connectPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}{connectPending ? 'Starting secure connectionâ€¦' : 'Connect account'}</button>
                ) : item.canDisconnect ? (
                  <button
                    type="button"
                    disabled={disconnectMutation.isPending || connectMutation.isPending}
                    onClick={() => disconnectMutation.mutate(item.id)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >{disconnectPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}{disconnectPending ? 'Removingâ€¦' : 'Disconnect account'}</button>
                ) : item.status === 'coming_soon' ? (
                  <span className="inline-flex w-full items-center justify-center rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">Connector not implemented</span>
                ) : item.status === 'setup_required' ? (
                  <span className="inline-flex w-full items-center justify-center rounded-lg border border-amber-500/30 px-3 py-2 text-xs text-amber-500">Server setup required</span>
                ) : item.status === 'managed' ? (
                  <span className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-blue-500/30 px-3 py-2 text-xs text-blue-500"><ShieldCheck className="h-3.5 w-3.5" /> Platform-managed</span>
                ) : (
                  <span className="inline-flex w-full items-center justify-center rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">Owner/admin access required</span>
                )}
              </motion.article>
            );
          })}
        </div>
      )}
      {!integrationsQuery.isLoading && !integrationsQuery.isError && filtered.length === 0 && (
        <div className="py-16 text-center text-muted-foreground"><Puzzle className="mx-auto mb-3 h-10 w-10 opacity-20" /><p>No integrations match the current search.</p></div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">Only Google Drive, Gmail, OneDrive and Outlook have OAuth connection flows in this patch. A successful account authorisation does not mean files or emails are already syncing into Company Brain; sync workers are a separate implementation step. Other cards are explicitly marked as unavailable until their connector exists.</p>
    </div>
  );
}