
'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Users,
  Building2,
  DollarSign,
  TrendingUp,
  Search,
  Ban,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import api from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {sub}
            </p>
          )}
        </div>

        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
}

export default function AdminPage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [tab, setTab] = useState<'users' | 'orgs' | 'audit'>('users');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const platformAdminEmail = (process.env.NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL ?? 'marufuinnocent0@gmail.com')
    .trim()
    .toLowerCase();
  const isPlatformAdmin = Boolean(
    platformAdminEmail &&
    (user?.email ?? '').trim().toLowerCase() === platformAdminEmail,
  );

  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await api.get('/admin/stats')).data.data,
    enabled: isPlatformAdmin,
  });

  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin', 'users', page, search],
    queryFn: async () =>
      (await api.get(`/admin/users?page=${page}&search=${search}`)).data.data,
    enabled: isPlatformAdmin && tab === 'users',
  });

  const { data: orgsData } = useQuery({
    queryKey: ['admin', 'orgs', page, search],
    queryFn: async () =>
      (await api.get(`/admin/organizations?page=${page}&search=${search}`)).data.data,
    enabled: isPlatformAdmin && tab === 'orgs',
    enabled: tab === 'orgs',
  });

  const { data: auditData } = useQuery({
    queryKey: ['admin', 'audit', page],
    queryFn: async () =>
      (await api.get(`/admin/audit-logs?page=${page}`)).data.data,
    enabled: isPlatformAdmin && tab === 'audit',
    enabled: tab === 'audit',
  });

  const suspendMut = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/users/${id}/suspend`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  const reinstateMut = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/users/${id}/reinstate`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  const mrr = stats
    ? `$${((stats.totals.mrrCents ?? 0) / 100).toLocaleString()}`
    : '—';

  if (!isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The Lumorius platform administration panel is available only to the software owner.
        </p>
      </div>
    );
  }
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header with official Lumorius logo */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center">
          <Image
            src="/logo.svg"
            alt="Lumorius"
            width={40}
            height={40}
            priority
            className="h-10 w-10 object-contain"
          />
        </div>

        <div>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">
            Platform management — INMARTECH PVT LTD
          </p>
        </div>

        <span className="ml-auto text-xs bg-red-500/10 text-red-500 px-3 py-1 rounded-full font-semibold">
          ADMIN ONLY
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={stats?.totals.users ?? '—'}
          icon={Users}
          color="bg-blue-500/10 text-blue-500"
        />
        <StatCard
          label="Organizations"
          value={stats?.totals.orgs ?? '—'}
          icon={Building2}
          color="bg-violet-500/10 text-violet-500"
        />
        <StatCard
          label="Active Subs"
          value={stats?.totals.activeSubs ?? '—'}
          icon={TrendingUp}
          color="bg-green-500/10 text-green-500"
        />
        <StatCard
          label="Monthly Revenue"
          value={mrr}
          sub="MRR (USD)"
          icon={DollarSign}
          color="bg-amber-500/10 text-amber-500"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit">
        {(['users', 'orgs', 'audit'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
              tab === t
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'audit'
              ? 'Audit Log'
              : t === 'orgs'
                ? 'Organisations'
                : 'Users'}
          </button>
        ))}
      </div>

      {/* Search */}
      {tab !== 'audit' && (
        <div className="relative w-80 max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={`Search ${tab}…`}
            className="w-full pl-9 pr-4 py-2 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          />
        </div>
      )}

      {/* Users table */}
      {tab === 'users' && (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/20">
              <tr>
                {[
                  'Name / Email',
                  'Organisation',
                  'Plan',
                  'Role',
                  'Status',
                  'Last Login',
                  'Actions',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {loadingUsers ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-4 bg-muted/50 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : (
                usersData?.data?.map((u: Record<string, unknown>) => (
                  <tr
                    key={u.id as string}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {u.full_name as string}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {u.email as string}
                      </p>
                    </td>

                    <td className="px-4 py-3 text-muted-foreground">
                      {(u.org_name as string) ?? '—'}
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-xs bg-violet-500/10 text-violet-500 px-2 py-0.5 rounded-full font-medium">
                        {(u.plan_name as string) ?? 'Free'}
                      </span>
                    </td>

                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {u.role as string}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`flex items-center gap-1 text-xs font-medium ${
                          u.is_active ? 'text-green-500' : 'text-red-500'
                        }`}
                      >
                        {u.is_active ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <Ban className="w-3 h-3" />
                        )}
                        {u.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.last_login_at
                        ? formatRelative(u.last_login_at as string)
                        : 'Never'}
                    </td>

                    <td className="px-4 py-3">
                      {u.is_active ? (
                        <button
                          type="button"
                          onClick={() => suspendMut.mutate(u.id as string)}
                          disabled={suspendMut.isPending}
                          className="p-1.5 text-amber-500 hover:bg-amber-500/10 rounded transition-colors disabled:opacity-50"
                          title="Suspend"
                          aria-label={`Suspend ${u.email as string}`}
                        >
                          <AlertTriangle className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => reinstateMut.mutate(u.id as string)}
                          disabled={reinstateMut.isPending}
                          className="p-1.5 text-green-500 hover:bg-green-500/10 rounded transition-colors disabled:opacity-50"
                          title="Reinstate"
                          aria-label={`Reinstate ${u.email as string}`}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}

              {!loadingUsers && !usersData?.data?.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {usersData?.total ?? 0} total users
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1 rounded hover:bg-accent disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-medium">Page {page}</span>

              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!usersData?.data?.length}
                className="p-1 rounded hover:bg-accent disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Organisations table */}
      {tab === 'orgs' && (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/20">
              <tr>
                {[
                  'Organisation',
                  'Slug',
                  'Plan',
                  'Members',
                  'Sub Status',
                  'Created',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {orgsData?.data?.map((o: Record<string, unknown>) => (
                <tr
                  key={o.id as string}
                  className="hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">
                    {o.name as string}
                  </td>

                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {o.slug as string}
                  </td>

                  <td className="px-4 py-3">
                    <span className="text-xs bg-violet-500/10 text-violet-500 px-2 py-0.5 rounded-full font-medium capitalize">
                      {o.plan_name as string}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-muted-foreground">
                    {o.member_count as number}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium capitalize ${
                        o.subscription_status === 'active'
                          ? 'text-green-500'
                          : 'text-amber-500'
                      }`}
                    >
                      {(o.subscription_status as string) ?? 'trial'}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(o.created_at as string).toLocaleDateString()}
                  </td>
                </tr>
              ))}

              {!orgsData?.data?.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No organisations found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit log */}
      {tab === 'audit' && (
        <div className="space-y-2">
          {auditData?.data?.map((log: Record<string, unknown>) => (
            <div
              key={log.id as string}
              className="flex items-start gap-3 p-4 bg-card border border-border rounded-xl"
            >
              <div className="p-1.5 bg-violet-500/10 rounded-lg mt-0.5">
                <Activity className="w-3.5 h-3.5 text-violet-500" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium font-mono">
                  {log.action as string}
                </p>

                <p className="text-xs text-muted-foreground mt-0.5">
                  {(log.user_email as string) ?? 'system'} —{' '}
                  {formatRelative(log.created_at as string)}
                </p>
              </div>

              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {log.resource_type as string}
              </span>
            </div>
          ))}

          {!auditData?.data?.length && (
            <div className="p-8 text-center text-sm text-muted-foreground bg-card border border-border rounded-xl">
              No audit records found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
