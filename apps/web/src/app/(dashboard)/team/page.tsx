'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Users, Plus, Mail, Crown, Shield, User, MoreHorizontal,
  Trash2, RefreshCw, CheckCircle, Clock,
} from 'lucide-react';
import api from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

const ROLE_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  owner:  { label: 'Owner',  color: 'text-amber-500 bg-amber-500/10',    icon: Crown  },
  admin:  { label: 'Admin',  color: 'text-red-500 bg-red-500/10',        icon: Shield },
  member: { label: 'Member', color: 'text-blue-500 bg-blue-500/10',      icon: User   },
  viewer: { label: 'Viewer', color: 'text-gray-500 bg-gray-500/10',      icon: User   },
};

export default function TeamPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail]   = useState('');
  const [role, setRole]     = useState('member');

  const { data, isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: async () => (await api.get('/organizations/members')).data.data,
  });

  const inviteMut = useMutation({
    mutationFn: (body: { email: string; role: string }) =>
      api.post('/organizations/members/invite', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      setEmail('');
      setShowInvite(false);
    },
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => api.delete(`/organizations/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  });

  const members  = (data?.members  ?? []) as Record<string, unknown>[];
  const pending  = (data?.pending   ?? []) as Record<string, unknown>[];
  const seatInfo = data?.seats as { used: number; max: number | null } | undefined;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 rounded-xl">
            <Users className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Team Members</h1>
            <p className="text-sm text-muted-foreground">
              {seatInfo
                ? `${seatInfo.used} / ${seatInfo.max ?? '∞'} seats used`
                : 'Manage your workspace members'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Invite Member
        </button>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-xl p-5"
        >
          <h3 className="font-semibold mb-4">Invite Team Member</h3>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </div>
            <div className="w-36">
              <label className="text-xs text-muted-foreground mb-1 block">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => inviteMut.mutate({ email, role })}
              disabled={!email || inviteMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Mail className="w-4 h-4" />
              {inviteMut.isPending ? 'Sending…' : 'Send Invite'}
            </button>
            <button
              onClick={() => setShowInvite(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      {/* Members list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold">Active Members ({members.length})</h2>
        </div>
        <div className="divide-y divide-border">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-muted rounded w-32 animate-pulse" />
                    <div className="h-3 bg-muted rounded w-48 animate-pulse" />
                  </div>
                </div>
              ))
            : members.map((m) => {
                const roleMeta = ROLE_META[m.role as string] ?? ROLE_META.member;
                const RoleIcon = roleMeta.icon;
                const initials = ((m.full_name as string) ?? (m.email as string) ?? 'U')
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <motion.div
                    key={m.user_id as string}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors"
                  >
                    {m.avatar_url ? (
                      <img src={m.avatar_url as string} className="w-9 h-9 rounded-full object-cover" alt="" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                        {initials}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{(m.full_name as string) ?? 'Unnamed'}</p>
                      <p className="text-xs text-muted-foreground">{m.email as string}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${roleMeta.color}`}>
                        <RoleIcon className="w-3 h-3" />
                        {roleMeta.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {m.last_login_at ? formatRelative(m.last_login_at as string) : 'Never'}
                      </span>
                      {m.user_id !== me?.id && m.role !== 'owner' && (
                        <button
                          onClick={() => removeMut.mutate(m.user_id as string)}
                          className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
        </div>
      </div>

      {/* Pending invites */}
      {pending.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-amber-500 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Pending Invitations ({pending.length})
            </h2>
          </div>
          <div className="divide-y divide-border">
            {pending.map((inv) => (
              <div key={inv.id as string} className="flex items-center gap-4 px-5 py-3">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <p className="flex-1 text-sm">{inv.email as string}</p>
                <span className="text-xs text-muted-foreground capitalize">{inv.role as string}</span>
                <span className="text-xs text-amber-500">Pending</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
