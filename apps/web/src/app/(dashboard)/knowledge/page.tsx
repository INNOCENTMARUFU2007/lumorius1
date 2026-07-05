'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Network, Search, RefreshCw, Loader2, Link2 } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';

const NODE_COLORS: Record<string, string> = {
  person: '#6366f1',
  document: '#8b5cf6',
  project: '#3b82f6',
  department: '#0ea5e9',
  task: '#10b981',
  customer: '#f59e0b',
  decision: '#ef4444',
  concept: '#6b7280',
};

export default function KnowledgePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge', 'graph', search],
    queryFn: async () => {
      const res = await api.get('/knowledge/graph', { params: { search: search || undefined, depth: 2 } });
      return res.data.data;
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post('/knowledge/sync'),
    onSuccess: (res) => {
      toast.success(`${(res.data.data as Record<string, unknown>).synced} nodes synced from documents`);
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
    },
  });

  const nodes: Record<string, unknown>[] = data?.nodes ?? [];
  const relations: Record<string, unknown>[] = data?.relations ?? [];

  const nodeTypes = [...new Set(nodes.map((n) => n.type as string))];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-xl">
            <Network className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Knowledge Graph</h1>
            <p className="text-muted-foreground text-sm">
              {nodes.length} nodes · {relations.length} relations
            </p>
          </div>
        </div>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition disabled:opacity-50"
        >
          {syncMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Sync from Docs
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search knowledge nodes…"
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Legend */}
      {nodeTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {nodeTypes.map((type) => (
            <span key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: NODE_COLORS[type] ?? '#6b7280' }}
              />
              {type}
            </span>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : nodes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Network className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No knowledge nodes yet.</p>
          <p className="text-sm mt-1">Sync from your documents to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {nodes.map((node) => {
            const nodeRelations = relations.filter(
              (r) => r.from_node_id === node.id || r.to_node_id === node.id,
            );
            return (
              <motion.div
                key={node.id as string}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-card border border-border rounded-xl hover:shadow-md transition cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: NODE_COLORS[node.type as string] ?? '#6b7280' }}
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{node.name as string}</p>
                    <p className="text-xs text-muted-foreground capitalize">{node.type as string}</p>
                    {node.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{node.description as string}</p>
                    )}
                    {nodeRelations.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <Link2 className="w-3 h-3" />
                        {nodeRelations.length} connection{nodeRelations.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
