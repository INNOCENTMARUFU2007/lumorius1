'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ShieldCheck, Key, Activity, AlertTriangle, Plus,
  Trash2, Copy, Eye, EyeOff, CheckCircle, Lock,
  Monitor, Smartphone,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';

function StatCard({ icon: Icon, label, value, color = 'violet' }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color?: string;
}) {
  const colors: Record<string, string> = {
    violet:  'bg-violet-500/10  text-violet-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber:   'bg-amber-500/10   text-amber-400',
    red:     'bg-red-500/10     text-red-400',
  };
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

const PUBLIC_API_SCOPES = [
  { value: 'documents:read', label: 'Read documents', description: 'Read document metadata in your organisation.' },
  { value: 'tasks:read', label: 'Read tasks', description: 'Read task data in your organisation.' },
  { value: 'projects:read', label: 'Read projects', description: 'Read project data in your organisation.' },
] as const;

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    const message = response?.data?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.map(String).join(', ');
  }
  return error instanceof Error ? error.message : fallback;
}
export default function SecurityPage() {
  const qc = useQueryClient();
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['documents:read']);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [keyVisible, setKeyVisible] = useState(false);
  const [mfaStep, setMfaStep] = useState<'idle' | 'setup' | 'verify'>('idle');
  const [mfaQr, setMfaQr] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  const { data: summary } = useQuery({
    queryKey: ['security', 'summary'],
    queryFn: async () => {
      const res = await api.get('/security/summary');
      return res.data.data as Record<string, unknown>;
    },
  });

  const { data: apiKeys = [] } = useQuery<Record<string, unknown>[]>({
    queryKey: ['security', 'api-keys'],
    queryFn: async () => {
      const res = await api.get('/security/api-keys');
      return res.data.data;
    },
  });

  const { data: auditLogs = [] } = useQuery<Record<string, unknown>[]>({
    queryKey: ['security', 'audit-logs'],
    queryFn: async () => {
      const res = await api.get('/security/audit-logs?limit=20');
      return res.data.data;
    },
  });

  const { data: sessions = [] } = useQuery<Record<string, unknown>[]>({
    queryKey: ['auth', 'sessions'],
    queryFn: async () => {
      const res = await api.get('/auth/sessions');
      return res.data.data;
    },
  });

  const createKey = useMutation({
    mutationFn: async () => {
      const res = await api.post('/security/api-keys', {
        name: newKeyName.trim(),
        scopes: selectedScopes,
      });
      return res.data.data as { key: string };
    },
    onSuccess: (data) => {
      setCreatedKey(data.key);
      setShowNewKey(false);
      setNewKeyName('');
      setSelectedScopes(['documents:read']);
      qc.invalidateQueries({ queryKey: ['security', 'api-keys'] });
      toast.success('API key created. Copy it now; it will not be shown again.');
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not create API key'));
    },
  });

  const revokeKey = useMutation({
    mutationFn: async (keyId: string) => {
      await api.delete(`/security/api-keys/${keyId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security', 'api-keys'] });
      qc.invalidateQueries({ queryKey: ['security', 'summary'] });
      toast.success('API key revoked');
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not revoke API key'));
    },
  });

  const revokeSession = useMutation({
    mutationFn: async (sessionId: string) => {
      await api.delete(`/auth/sessions/${sessionId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
      toast.success('Session revoked');
    },
  });

  const revokeAll = useMutation({
    mutationFn: async () => { await api.delete('/auth/sessions/all'); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
      toast.success('All sessions revoked — you will be signed out on other devices');
    },
  });

  const setupMfa = useMutation({
    mutationFn: async () => {
      const res = await api.post('/auth/mfa/setup');
      return res.data.data as { qrCodeUrl: string };
    },
    onSuccess: (data) => {
      setMfaQr(data.qrCodeUrl);
      setMfaStep('verify');
    },
  });

  const enableMfa = useMutation({
    mutationFn: async () => {
      await api.post('/auth/mfa/enable', { code: mfaCode });
    },
    onSuccess: () => {
      setMfaStep('idle');
      toast.success('MFA enabled — your account is now more secure!');
    },
    onError: () => toast.error('Invalid code — try again'),
  });

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('API key copied to clipboard');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-violet-500/10 rounded-xl">
          <ShieldCheck className="w-6 h-6 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Security Centre</h1>
          <p className="text-gray-400 text-sm">API keys, sessions, MFA, and audit logs</p>
        </div>
      </div>

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={Key}           label="Active API Keys"      value={summary.apiKeysActive as number}         color="violet"  />
          <StatCard icon={CheckCircle}   label="Logins (24h)"        value={summary.loginsLast24h as number}         color="emerald" />
          <StatCard icon={AlertTriangle} label="Failed Logins (24h)" value={summary.failedLoginsLast24h as number}   color={Number(summary.failedLoginsLast24h) > 5 ? 'red' : 'amber'} />
          <StatCard icon={ShieldCheck}   label="MFA Adoption"        value={`${summary.mfaAdoptionRate as number}%`} color="emerald" />
        </div>
      )}

      {/* MFA */}
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-violet-400" />
            <h2 className="font-semibold text-white">Multi-Factor Authentication (MFA)</h2>
          </div>
          {mfaStep === 'idle' && (
            <button
              onClick={() => { setMfaStep('setup'); setupMfa.mutate(); }}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg transition"
            >
              Enable MFA
            </button>
          )}
        </div>
        {mfaStep === 'idle' && (
          <p className="text-sm text-gray-400">
            Add an extra layer of protection with a one-time password (TOTP) app like Google Authenticator or Authy.
          </p>
        )}
        {mfaStep === 'verify' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Scan this QR code with your authenticator app, then enter the 6-digit code.</p>
            {mfaQr && (
              <img src={mfaQr} alt="MFA QR Code" className="w-40 h-40 rounded-xl border border-gray-700 bg-white p-1" />
            )}
            <div className="flex gap-2 max-w-xs">
              <input
                className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-violet-500 tracking-widest"
                placeholder="000000"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
              />
              <button
                onClick={() => enableMfa.mutate()}
                disabled={mfaCode.length !== 6 || enableMfa.isPending}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-700 text-white text-sm rounded-lg transition"
              >
                Verify
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Created Key Banner */}
      {createdKey && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-amber-400 font-semibold text-sm mb-2">
                ⚠️ Copy your API key now — it won't be shown again
              </p>
              <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-200 break-all">
                <span className="flex-1 truncate">
                  {keyVisible ? createdKey : createdKey.replace(/./g, '•').slice(0, 40) + '…'}
                </span>
                <button onClick={() => setKeyVisible(!keyVisible)} className="text-gray-400 hover:text-white transition shrink-0">
                  {keyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button onClick={() => copyKey(createdKey)} className="text-gray-400 hover:text-violet-400 transition shrink-0">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
            <button onClick={() => setCreatedKey(null)} className="text-gray-500 hover:text-white transition shrink-0 text-lg leading-none">×</button>
          </div>
        </motion.div>
      )}

      {/* API Keys */}
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-violet-400" />
            <h2 className="font-semibold text-white">API Keys</h2>
            <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{apiKeys.length}</span>
          </div>
          <button
            onClick={() => setShowNewKey(!showNewKey)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg transition"
          >
            <Plus className="w-4 h-4" /> New Key
          </button>
        </div>

        {showNewKey && (
          <div className="mb-4 space-y-3 rounded-xl border border-gray-800 p-3">
            <div className="flex gap-2">
              <input
                className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-violet-500"
                placeholder="Key name (e.g. Production CRM)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newKeyName.trim() && selectedScopes.length > 0 && createKey.mutate()}
                autoFocus
                maxLength={100}
              />
              <button
                onClick={() => createKey.mutate()}
                disabled={!newKeyName.trim() || selectedScopes.length === 0 || createKey.isPending}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-700 text-white text-sm rounded-lg transition"
              >
                {createKey.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-200">API permissions</p>
              <p className="text-xs text-gray-500 mt-1">Choose the minimum permissions this integration needs. These scopes are enforced by the public API.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                {PUBLIC_API_SCOPES.map((scope) => (
                  <label key={scope.value} className="flex items-start gap-2 rounded-lg border border-gray-800 bg-gray-950/50 p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 accent-violet-500"
                      checked={selectedScopes.includes(scope.value)}
                      onChange={(e) => setSelectedScopes((current) => e.target.checked
                        ? Array.from(new Set([...current, scope.value]))
                        : current.filter((value) => value !== scope.value))}
                    />
                    <span>
                      <span className="block text-xs font-medium text-gray-200">{scope.label}</span>
                      <span className="block text-xs text-gray-500 mt-1">{scope.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              {selectedScopes.length === 0 && <p className="text-xs text-amber-400 mt-2">Select at least one permission.</p>}
            </div>
          </div>
        )}

        {apiKeys.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No API keys yet. Create one to authenticate external integrations.</p>
        ) : (
          <div className="space-y-2">
            {apiKeys.map((key) => (
              <div key={key.id as string} className="flex items-center justify-between p-3 bg-gray-800 rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <Key className="w-4 h-4 text-violet-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{key.name as string}</p>
                    <p className="text-xs text-gray-500 font-mono">{key.key_prefix as string}…</p>
                    <p className="text-xs text-gray-500 mt-1">Permissions: {Array.isArray(key.scopes) ? key.scopes.map(String).join(', ') : 'Not specified'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  {Boolean(key.last_used_at) &&  (
                    <span className="text-xs text-gray-500 hidden sm:block">
                      Last used {new Date(key.last_used_at as string).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      if (confirm('Revoke this API key? This cannot be undone.')) {
                        revokeKey.mutate(key.id as string);
                      }
                    }}
                    className="text-gray-500 hover:text-red-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active Sessions */}
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-violet-400" />
            <h2 className="font-semibold text-white">Active Sessions</h2>
            <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{sessions.length}</span>
          </div>
          {sessions.length > 1 && (
            <button
              onClick={() => revokeAll.mutate()}
              className="text-sm text-red-400 hover:text-red-300 transition"
            >
              Sign out everywhere
            </button>
          )}
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No active sessions.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div key={session.id as string} className="flex items-center justify-between p-3 bg-gray-800 rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  {(session.device_type as string) === 'mobile'
                    ? <Smartphone className="w-4 h-4 text-gray-400 shrink-0" />
                    : <Monitor    className="w-4 h-4 text-gray-400 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">
                      {session.device_name as string || 'Unknown device'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {session.ip_address as string} · Active {new Date(session.last_active_at as string).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => revokeSession.mutate(session.id as string)}
                  className="text-gray-500 hover:text-red-400 transition shrink-0 ml-4"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Audit Log */}
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-violet-400" />
          <h2 className="font-semibold text-white">Audit Log</h2>
          <span className="text-xs text-gray-500 ml-auto">Last 20 events</span>
        </div>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No audit events yet.</p>
        ) : (
          <div className="space-y-1">
            {auditLogs.map((log) => (
              <div key={log.id as string} className="flex items-start gap-3 py-2.5 border-b border-gray-800 last:border-0">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200">
                    <span className="font-mono text-violet-400 text-xs">{log.action as string}</span>
                    {Boolean(log.resource_type) && <span className="text-gray-500"> · {log.resource_type as string}</span>}
                  </p>
                  {Boolean(log.user_name) && <p className="text-xs text-gray-500 mt-0.5">by {log.user_name as string}</p>}
                </div>
                <span className="text-xs text-gray-600 shrink-0">
                  {new Date(log.created_at as string).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
