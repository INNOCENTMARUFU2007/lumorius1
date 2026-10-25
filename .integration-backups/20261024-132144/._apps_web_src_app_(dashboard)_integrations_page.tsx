'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Puzzle, Search, CheckCircle, ExternalLink, Zap, Plus } from 'lucide-react';

const INTEGRATIONS = [
  { id: 'slack',      name: 'Slack',         category: 'Communication', description: 'Get AI insights and meeting summaries sent directly to Slack channels.', color: '#4A154B', emoji: '💬' },
  { id: 'notion',     name: 'Notion',        category: 'Knowledge',     description: 'Sync documents and knowledge base entries bidirectionally with Notion.', color: '#000000', emoji: '📝' },
  { id: 'jira',       name: 'Jira',          category: 'Project Mgmt',  description: 'Sync tasks and project milestones from Lumorius to Jira automatically.', color: '#0052CC', emoji: '📋' },
  { id: 'github',     name: 'GitHub',        category: 'Development',   description: 'Link code commits and PRs to tasks. Track dev velocity in Founder OS.', color: '#24292F', emoji: '🐙' },
  { id: 'google',     name: 'Google Meet',   category: 'Meetings',      description: 'Auto-import meeting recordings and generate AI transcriptions.', color: '#1A73E8', emoji: '📹' },
  { id: 'zoom',       name: 'Zoom',          category: 'Meetings',      description: 'Connect Zoom meetings for automatic transcription and action items.', color: '#2D8CFF', emoji: '🎥' },
  { id: 'hubspot',    name: 'HubSpot',       category: 'CRM',           description: 'Sync customer data and pipeline to inform AI strategy recommendations.', color: '#FF7A59', emoji: '🧡' },
  { id: 'salesforce', name: 'Salesforce',    category: 'CRM',           description: 'Pull CRM data into your Company Brain for intelligent customer context.', color: '#00A1E0', emoji: '☁️' },
  { id: 'linear',     name: 'Linear',        category: 'Project Mgmt',  description: 'Sync Linear issues and cycles into Lumorius OKR tracking.', color: '#5E6AD2', emoji: '📐' },
  { id: 'stripe',     name: 'Stripe',        category: 'Finance',       description: 'Already connected. Revenue data feeds Founder OS health scoring.', color: '#635BFF', emoji: '💳', alwaysOn: true },
  { id: 'zapier',     name: 'Zapier',        category: 'Automation',    description: 'Connect 6,000+ apps using Lumorius as a trigger or action source.', color: '#FF4A00', emoji: '⚡' },
  { id: 'make',       name: 'Make',          category: 'Automation',    description: 'Visual automation builder — connect Lumorius to any external service.', color: '#6D00CC', emoji: '🔄' },
  { id: 'intercom',   name: 'Intercom',      category: 'Support',       description: 'Route customer conversations and ticket insights into your brain.', color: '#1F8DED', emoji: '💬' },
  { id: 'pagerduty',  name: 'PagerDuty',     category: 'Monitoring',    description: 'Get incident alerts surfaced in your notifications and dashboard.', color: '#06AC38', emoji: '🚨' },
  { id: 'datadog',    name: 'Datadog',       category: 'Monitoring',    description: 'Correlate system health with business KPIs in Founder OS.', color: '#632CA6', emoji: '📊' },
  { id: 'dropbox',    name: 'Dropbox',       category: 'Storage',       description: 'Import files from Dropbox directly into Company Brain for RAG.', color: '#0061FF', emoji: '📦' },
];

const categories = ['All', ...Array.from(new Set(INTEGRATIONS.map((i) => i.category)))];

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [search, setSearch]   = useState('');
  const [cat, setCat]         = useState('All');

  const { data: connected } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      try {
        const res = await (await import('@/lib/api')).default.get('/integrations');
        return (res.data.data ?? []) as string[];
      } catch { return [] as string[]; }
    },
  });

  const connectMut = useMutation({
    mutationFn: (id: string) => import('@/lib/api').then((m) => m.default.post(`/integrations/${id}/connect`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const disconnectMut = useMutation({
    mutationFn: (id: string) => import('@/lib/api').then((m) => m.default.delete(`/integrations/${id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const connectedIds = new Set(connected ?? []);

  const filtered = INTEGRATIONS.filter((i) => {
    const matchCat    = cat === 'All' || i.category === cat;
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase()) ||
                        i.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-indigo-500/10 rounded-xl">
          <Puzzle className="w-6 h-6 text-indigo-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Connect your tools to Lumorius — {connectedIds.size} connected
          </p>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations…"
            className="w-full pl-9 pr-4 py-2 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                cat === c
                  ? 'bg-violet-500 text-white'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((integration) => {
          const isConnected = connectedIds.has(integration.id) || integration.alwaysOn;
          return (
            <motion.div
              key={integration.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{integration.emoji}</span>
                  <div>
                    <p className="font-semibold text-sm">{integration.name}</p>
                    <p className="text-[10px] text-muted-foreground">{integration.category}</p>
                  </div>
                </div>
                {isConnected && (
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                )}
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                {integration.description}
              </p>

              <div className="flex gap-2">
                {integration.alwaysOn ? (
                  <span className="flex items-center gap-1 text-xs text-green-500 font-medium">
                    <Zap className="w-3 h-3" /> Always active
                  </span>
                ) : isConnected ? (
                  <button
                    onClick={() => disconnectMut.mutate(integration.id)}
                    className="flex-1 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:border-red-500/50 hover:text-red-500 transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => connectMut.mutate(integration.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Connect
                  </button>
                )}
                <button className="p-1.5 border border-border rounded-lg text-muted-foreground hover:bg-accent transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Puzzle className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>No integrations match your search.</p>
        </div>
      )}
    </div>
  );
}
