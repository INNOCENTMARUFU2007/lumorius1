'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Users, Building2, Bell, Shield, Mail } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');

  const { data: org } = useQuery({
    queryKey: ['org'],
    queryFn: async () => {
      const res = await api.get('/organizations/me');
      return res.data.data;
    },
  });

  const { data: usage } = useQuery({
    queryKey: ['org', 'usage'],
    queryFn: async () => {
      const res = await api.get('/organizations/me/usage');
      return res.data.data;
    },
  });

  const inviteMutation = useMutation({
    mutationFn: () => api.post('/organizations/me/invite', { email: inviteEmail, role: inviteRole }),
    onSuccess: () => {
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error?.response?.data?.message ?? 'Failed to send invitation');
    },
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gray-500/10 rounded-xl">
          <Settings className="w-5 h-5 text-gray-500" />
        </div>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Organization */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Organization</h3>
        </div>
        {org && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Name</p>
              <p className="font-medium">{(org as Record<string, unknown>).name as string}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Slug</p>
              <p className="font-medium font-mono">{(org as Record<string, unknown>).slug as string}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Plan</p>
              <p className="font-medium capitalize">{(org as Record<string, unknown>).plan_name as string}</p>
            </div>
          </div>
        )}
      </div>

      {/* Usage */}
      {usage && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold">Usage</h3>
          </div>
          <div className="space-y-3">
            {[
              {
                label: 'Users',
                used: (usage as Record<string, Record<string, unknown>>).users.used as number,
                limit: (usage as Record<string, Record<string, unknown>>).users.limit as number | null,
              },
              {
                label: 'Storage',
                used: Math.round(Number((usage as Record<string, Record<string, unknown>>).storage.usedGb) * 10) / 10,
                limit: (usage as Record<string, Record<string, unknown>>).storage.limitGb as number | null,
                suffix: 'GB',
              },
              {
                label: 'AI Requests',
                used: (usage as Record<string, Record<string, unknown>>).aiRequests.used as number,
                limit: (usage as Record<string, Record<string, unknown>>).aiRequests.limit as number | null,
              },
            ].map(({ label, used, limit, suffix }) => {
              const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
              return (
                <div key={label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">
                      {used.toLocaleString()}{suffix ? ` ${suffix}` : ''}{' '}
                      {limit ? `/ ${limit.toLocaleString()}${suffix ? ` ${suffix}` : ''}` : '(unlimited)'}
                    </span>
                  </div>
                  {limit && (
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-brand-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invite */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Invite Team Members</h3>
        </div>
        <div className="flex gap-2">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@company.com"
            type="email"
            className="flex-1 px-4 py-2.5 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="px-3 py-2.5 text-sm bg-muted border border-border rounded-lg focus:outline-none"
          >
            {['viewer', 'member', 'manager', 'admin'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button
            onClick={() => inviteEmail && inviteMutation.mutate()}
            disabled={!inviteEmail || inviteMutation.isPending}
            className="px-4 py-2.5 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
          >
            Invite
          </button>
        </div>
      </div>

      {/* Profile */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Your Profile</h3>
        </div>
        {user && (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center text-white font-bold text-lg">
              {user.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-foreground">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <span className="text-xs capitalize bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full mt-1 inline-block">
                {user.role}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
