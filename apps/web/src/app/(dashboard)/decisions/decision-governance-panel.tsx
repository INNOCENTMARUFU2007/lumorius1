'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Users,
  Copy,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';

export type DecisionGovernancePolicy = {
  id: string;
  decision_type: string;
  priority: string;
  required_approver_role: string;
  approval_due_hours: number;
  allow_delegation: boolean;
  escalation_repeat_hours: number;
  is_active: boolean;
};

export type DecisionGovernanceDelegation = {
  id: string;
  principalUserId: string;
  principalName?: string | null;
  delegateUserId: string;
  delegateName?: string | null;
  decisionType: string;
  priority: string;
  validFrom: string;
  validUntil: string;
  revokedAt?: string | null;
  createdAt: string;
};

export type DecisionGovernanceQueueItem = {
  id: string;
  title: string;
  decisionType: string;
  priority: string;
  requiredRole: string;
  approvalDueAt: string;
  lastEscalatedAt?: string | null;
  escalationCount: number;
  ownerName?: string | null;
  hoursOverdue: number;
  isOverdue: boolean;
};

export type DecisionGovernanceOverview = {
  summary: { pending: number; overdue: number; dueSoon: number; escalated: number };
  queue: DecisionGovernanceQueueItem[];
  policies: DecisionGovernancePolicy[];
  delegations: DecisionGovernanceDelegation[];
  events: Array<{
    id: string;
    eventType: string;
    details?: Record<string, unknown> | null;
    note?: string | null;
    createdAt: string;
    actorName?: string | null;
    actorEmail?: string | null;
    representedUserName?: string | null;
    decisionTitle?: string | null;
  }>;
  permissions: { managePolicies: boolean; manageOrganisation: boolean; canEscalate: boolean };
};

type GovernanceMemberOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type PolicyForm = {
  decisionType: string;
  priority: string;
  requiredApproverRole: string;
  approvalDueHours: string;
  allowDelegation: boolean;
  escalationRepeatHours: string;
};

const EMPTY_POLICY: PolicyForm = {
  decisionType: 'all',
  priority: 'all',
  requiredApproverRole: 'manager',
  approvalDueHours: '24',
  allowDelegation: true,
  escalationRepeatHours: '24',
};

function unwrap<T>(value: any): T {
  let result = value;
  for (let index = 0; index < 2; index += 1) {
    if (result && typeof result === 'object' && 'data' in result) result = result.data;
    else break;
  }
  return result as T;
}

function errorMessage(error: any, fallback: string): string {
  const message = error?.response?.data?.message ?? error?.message;
  if (Array.isArray(message)) return message.join(', ');
  return typeof message === 'string' && message.trim() ? message : fallback;
}

function dateLabel(value?: string | null): string {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not set' : parsed.toLocaleString();
}

function eventLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

function parseMembers(value: unknown): GovernanceMemberOption[] {
  const rows = unwrap<unknown>(value);
  if (!Array.isArray(rows)) {
    throw new Error('The organization members response was invalid.');
  }

  return rows.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const role = typeof row.role === 'string' ? row.role : 'member';
    const active = row.is_active !== false && row.status !== 'inactive';
    if (!id || !active) return [];

    const email = typeof row.email === 'string' ? row.email : '';
    const name = typeof row.name === 'string' && row.name.trim()
      ? row.name.trim()
      : email || id;
    return [{ id, name, email, role }];
  });
}

async function copyMemberId(id: string) {
  try {
    await navigator.clipboard.writeText(id);
    toast.success('User ID copied');
  } catch {
    toast.error('Clipboard access is unavailable. Select the ID to copy it manually.');
  }
}

const panelClass = 'rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5';
const fieldClass = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10';
const labelClass = 'mb-1.5 block text-xs font-semibold text-muted-foreground';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50';
const subtleButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';

export default function DecisionGovernancePanel({ onOpenDecision }: { onOpenDecision: (id: string) => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [policyForm, setPolicyForm] = useState<PolicyForm>(EMPTY_POLICY);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [delegateUserId, setDelegateUserId] = useState('');
  const [delegationType, setDelegationType] = useState('all');
  const [delegationPriority, setDelegationPriority] = useState('all');
  const [validUntil, setValidUntil] = useState('');
  const [delegationNote, setDelegationNote] = useState('');

  const governanceQuery = useQuery<DecisionGovernanceOverview>({
    queryKey: ['decisions', 'governance'],
    queryFn: async () => {
      const response = await api.get('/knowledge/decisions/governance/overview');
      return unwrap<DecisionGovernanceOverview>(response.data);
    },
    staleTime: 20_000,
    refetchInterval: 60_000,
  });

  const membersQuery = useQuery<GovernanceMemberOption[]>({
    queryKey: ['organization', 'governance-members'],
    queryFn: async () => {
      const response = await api.get('/organizations/members');
      return parseMembers(response.data);
    },
    staleTime: 30_000,
  });

  function refreshGovernance() {
    queryClient.invalidateQueries({ queryKey: ['decisions', 'governance'] });
    queryClient.invalidateQueries({ queryKey: ['decisions'] });
  }

  const savePolicyMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        ...policyForm,
        approvalDueHours: Number(policyForm.approvalDueHours),
        escalationRepeatHours: Number(policyForm.escalationRepeatHours),
      };
      if (editingPolicyId) payload.id = editingPolicyId;
      return api.post('/knowledge/decisions/governance/policies', payload);
    },
    onSuccess: () => {
      toast.success(editingPolicyId ? 'Approval policy updated' : 'Approval policy created');
      setPolicyForm(EMPTY_POLICY);
      setEditingPolicyId(null);
      refreshGovernance();
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Could not save the approval policy.')),
  });

  const deactivatePolicyMutation = useMutation({
    mutationFn: (id: string) => api.post(`/knowledge/decisions/governance/policies/${id}/deactivate`),
    onSuccess: () => { toast.success('Approval policy deactivated'); refreshGovernance(); },
    onError: (error: any) => toast.error(errorMessage(error, 'Could not deactivate the policy.')),
  });

  const createDelegationMutation = useMutation({
    mutationFn: async () => {
      if (!validUntil) throw new Error('Choose an expiry date for this delegation.');
      return api.post('/knowledge/decisions/governance/delegations', {
        delegateUserId: delegateUserId.trim(),
        decisionType: delegationType,
        priority: delegationPriority,
        validUntil: new Date(validUntil).toISOString(),
        note: delegationNote.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Approval delegation granted');
      setDelegateUserId('');
      setDelegationType('all');
      setDelegationPriority('all');
      setValidUntil('');
      setDelegationNote('');
      refreshGovernance();
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Could not grant approval delegation.')),
  });

  const revokeDelegationMutation = useMutation({
    mutationFn: (id: string) => api.post(`/knowledge/decisions/governance/delegations/${id}/revoke`),
    onSuccess: () => { toast.success('Approval delegation revoked'); refreshGovernance(); },
    onError: (error: any) => toast.error(errorMessage(error, 'Could not revoke this delegation.')),
  });

  const escalateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/knowledge/decisions/${id}/escalate`, { note: 'Escalated from Decision Governance.' }),
    onSuccess: () => { toast.success('Overdue approval escalated'); refreshGovernance(); },
    onError: (error: any) => toast.error(errorMessage(error, 'Could not escalate this approval.')),
  });

  const data = governanceQuery.data;
  const summary = data?.summary;
  const currentUserId = String(user?.id ?? '');
  const delegateOptions = (membersQuery.data ?? []).filter((member) => member.id !== currentUserId);
  const selectedDelegate = delegateOptions.find((member) => member.id === delegateUserId);

  function submitPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    savePolicyMutation.mutate();
  }

  function submitDelegation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createDelegationMutation.mutate();
  }

  function editPolicy(policy: DecisionGovernancePolicy) {
    setEditingPolicyId(policy.id);
    setPolicyForm({
      decisionType: policy.decision_type,
      priority: policy.priority,
      requiredApproverRole: policy.required_approver_role,
      approvalDueHours: String(policy.approval_due_hours),
      allowDelegation: policy.allow_delegation,
      escalationRepeatHours: String(policy.escalation_repeat_hours),
    });
  }

  return (
    <section data-v410="decision-governance" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-500" /><h2 className="text-base font-semibold tracking-tight">Decision Governance</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">Approval controls, delegated authority, deadlines and escalation history.</p>
        </div>
        <button type="button" onClick={() => governanceQuery.refetch()} disabled={governanceQuery.isFetching} className={subtleButtonClass}>
          <RefreshCw className={`h-3.5 w-3.5 ${governanceQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh governance
        </button>
      </div>

      {governanceQuery.isLoading ? (
        <div className={`${panelClass} flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground`}><Loader2 className="h-4 w-4 animate-spin" /> Loading governance controls...</div>
      ) : governanceQuery.isError ? (
        <div className={`${panelClass} flex items-center gap-3 text-sm`}><AlertCircle className="h-5 w-5 text-rose-500" /><span>Governance data could not be loaded.</span><button type="button" onClick={() => governanceQuery.refetch()} className="ml-auto text-xs font-semibold text-brand-500">Retry</button></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: 'Policy-governed pending', value: summary?.pending ?? 0, icon: FileCheck2 },
              { label: 'Overdue approvals', value: summary?.overdue ?? 0, icon: AlertCircle },
              { label: 'Due within 48 hours', value: summary?.dueSoon ?? 0, icon: Clock3 },
              { label: 'Escalated approvals', value: summary?.escalated ?? 0, icon: ArrowUpRight },
            ].map((item) => {
              const Icon = item.icon;
              return <div key={item.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</span><Icon className="h-4 w-4 text-muted-foreground" /></div><p className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</p></div>;
            })}
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-2">
            <div className={`${panelClass} space-y-4`}>
              <div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Approval policies</h3><p className="mt-1 text-[11px] text-muted-foreground">Rules are snapshotted when a decision is proposed.</p></div><ShieldCheck className="h-4 w-4 text-muted-foreground" /></div>
              {data?.permissions.managePolicies ? (
                <>
                  <form onSubmit={submitPolicy} className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{editingPolicyId ? 'Edit policy' : 'New approval policy'}</p>{editingPolicyId && <button type="button" onClick={() => { setEditingPolicyId(null); setPolicyForm(EMPTY_POLICY); }} className="text-[10px] font-semibold text-muted-foreground hover:text-foreground">Cancel edit</button>}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <label><span className={labelClass}>Decision type</span><select value={policyForm.decisionType} onChange={(event) => setPolicyForm((current) => ({ ...current, decisionType: event.target.value }))} className={fieldClass}><option value="all">All types</option>{['strategic','operational','product','technical','financial','customer','people','compliance','other'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                      <label><span className={labelClass}>Priority</span><select value={policyForm.priority} onChange={(event) => setPolicyForm((current) => ({ ...current, priority: event.target.value }))} className={fieldClass}><option value="all">All priorities</option>{['low','medium','high','critical'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                      <label><span className={labelClass}>Minimum approver role</span><select value={policyForm.requiredApproverRole} onChange={(event) => setPolicyForm((current) => ({ ...current, requiredApproverRole: event.target.value }))} className={fieldClass}><option value="manager">Manager</option><option value="admin">Admin</option><option value="owner">Owner</option></select></label>
                      <label><span className={labelClass}>Approval deadline (hours)</span><input type="number" min="1" max="8760" required value={policyForm.approvalDueHours} onChange={(event) => setPolicyForm((current) => ({ ...current, approvalDueHours: event.target.value }))} className={fieldClass} /></label>
                      <label className="col-span-2"><span className={labelClass}>Repeat escalation interval (hours)</span><input type="number" min="1" max="720" required value={policyForm.escalationRepeatHours} onChange={(event) => setPolicyForm((current) => ({ ...current, escalationRepeatHours: event.target.value }))} className={fieldClass} /></label>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={policyForm.allowDelegation} onChange={(event) => setPolicyForm((current) => ({ ...current, allowDelegation: event.target.checked }))} className="h-4 w-4 accent-brand-500" /> Permit valid delegated approvals</label>
                    <button type="submit" disabled={savePolicyMutation.isPending} className={buttonClass}>{savePolicyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editingPolicyId ? 'Save policy' : 'Create policy'}</button>
                  </form>
                  <div className="space-y-2">
                    {(data?.policies ?? []).length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">No approval policies configured. Existing decision workflows remain unchanged.</p> : (data?.policies ?? []).map((policy) => (
                      <div key={policy.id} className="rounded-xl border border-border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold capitalize">{policy.decision_type}  |  {policy.priority}</p><p className="mt-1 text-[11px] text-muted-foreground">Requires {policy.required_approver_role}  |  Deadline {policy.approval_due_hours}h  |  Escalation repeat {policy.escalation_repeat_hours}h</p><p className="mt-1 text-[10px] text-muted-foreground">Delegation {policy.allow_delegation ? 'permitted' : 'disabled'}  |  {policy.is_active ? 'Active' : 'Inactive'}</p></div><div className="flex gap-2"><button type="button" onClick={() => editPolicy(policy)} className={subtleButtonClass}>Edit</button>{policy.is_active && <button type="button" onClick={() => deactivatePolicyMutation.mutate(policy.id)} disabled={deactivatePolicyMutation.isPending} className="rounded-xl border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 disabled:opacity-50">Deactivate</button>}</div></div>
                      </div>
                    ))}
                  </div>
                </>
              ) : <p className="rounded-xl border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">Only organisation owners and administrators can create or change approval policies. You can still review delegations and approvals available to your account.</p>}
            </div>

            <div className={`${panelClass} space-y-4`}>
              <div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Delegated authority</h3><p className="mt-1 text-[11px] text-muted-foreground">Grant another active organisation member scoped approval authority.</p></div><Users className="h-4 w-4 text-muted-foreground" /></div>
              <form onSubmit={submitDelegation} className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-xs font-semibold">Grant a delegation</p>
                <label>
                  <span className={labelClass}>Delegate member</span>
                  <select
                    required
                    value={delegateUserId}
                    onChange={(event) => setDelegateUserId(event.target.value)}
                    disabled={membersQuery.isLoading || membersQuery.isError || delegateOptions.length === 0}
                    className={fieldClass}
                  >
                    <option value="">
                      {membersQuery.isLoading
                        ? 'Loading members…'
                        : delegateOptions.length === 0
                          ? 'No other active members'
                          : 'Select an active member'}
                    </option>
                    {delegateOptions.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} ({member.role}){member.email ? ` · ${member.email}` : ''}
                      </option>
                    ))}
                  </select>
                  {membersQuery.isError ? (
                    <span role="alert" className="mt-1 flex items-center gap-2 text-[10px] text-rose-600">
                      Members could not be loaded.
                      <button type="button" onClick={() => void membersQuery.refetch()} className="font-semibold underline">Retry</button>
                    </span>
                  ) : selectedDelegate ? (
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <code className="break-all">{selectedDelegate.id}</code>
                      <button
                        type="button"
                        onClick={() => void copyMemberId(selectedDelegate.id)}
                        className="inline-flex items-center gap-1 font-semibold text-brand-500 hover:underline"
                      >
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        Copy ID
                      </button>
                    </span>
                  ) : (
                    <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">
                      {delegateOptions.length === 0
                        ? 'Invite a teammate and have them accept before assigning approval authority.'
                        : 'Choose an active member of this organisation. You cannot delegate to yourself.'}
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label><span className={labelClass}>Decision type</span><select value={delegationType} onChange={(event) => setDelegationType(event.target.value)} className={fieldClass}><option value="all">All types</option>{['strategic','operational','product','technical','financial','customer','people','compliance','other'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label><span className={labelClass}>Priority</span><select value={delegationPriority} onChange={(event) => setDelegationPriority(event.target.value)} className={fieldClass}><option value="all">All priorities</option>{['low','medium','high','critical'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                </div>
                <label><span className={labelClass}>Delegation expires</span><input required type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} min={new Date().toISOString().slice(0, 16)} className={fieldClass} /></label>
                <label><span className={labelClass}>Reason (optional)</span><input value={delegationNote} onChange={(event) => setDelegationNote(event.target.value)} maxLength={1000} placeholder="Temporary approval coverage" className={fieldClass} /></label>
                <button type="submit" disabled={createDelegationMutation.isPending || !selectedDelegate || !validUntil} className={buttonClass}>{createDelegationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Grant delegation</button>
              </form>
              <div className="space-y-2">
                {(data?.delegations ?? []).length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">No delegation records are visible to this account.</p> : (data?.delegations ?? []).map((delegation) => {
                  const expired = new Date(delegation.validUntil).getTime() <= Date.now();
                  const active = !delegation.revokedAt && !expired;
                  return <div key={delegation.id} className="rounded-xl border border-border p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-xs font-semibold">{delegation.principalName || 'Principal'} <ArrowUpRight className="inline h-3 w-3" /> {delegation.delegateName || 'Delegate'}</p><p className="mt-1 text-[10px] text-muted-foreground">{delegation.decisionType}  |  {delegation.priority}  |  Expires {dateLabel(delegation.validUntil)}</p><p className="mt-1 text-[10px] text-muted-foreground">{delegation.principalUserId === delegation.delegateUserId ? 'Invalid self-delegation' : active ? 'Active' : delegation.revokedAt ? 'Revoked' : 'Expired'}</p></div>{active && <button type="button" onClick={() => revokeDelegationMutation.mutate(delegation.id)} disabled={revokeDelegationMutation.isPending} className="shrink-0 rounded-lg border border-rose-500/30 px-2.5 py-1.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-500/10 disabled:opacity-50">Revoke</button>}</div></div>;
                })}
              </div>
            </div>
          </div>

          <div className={panelClass}>
            <div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Approval queue and escalation</h3><p className="mt-1 text-[11px] text-muted-foreground">Policy-governed proposals due within the next seven days, including overdue records.</p></div><ShieldAlert className="h-4 w-4 text-muted-foreground" /></div>
            {(data?.queue ?? []).length === 0 ? <p className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">No policy-governed approvals are due in the current window.</p> : <div className="divide-y divide-border">{(data?.queue ?? []).map((item) => {
              return <div key={item.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => onOpenDecision(item.id)} className="min-w-0 flex-1 text-left"><span className="block break-words text-xs font-semibold hover:text-brand-500">{item.title}</span><span className="mt-1 block text-[10px] capitalize text-muted-foreground">{item.decisionType}  |  {item.priority} priority  |  {item.requiredRole} approval  |  {item.ownerName || 'Unassigned owner'}</span><span className="mt-1 block text-[10px] text-muted-foreground">Deadline {dateLabel(item.approvalDueAt)}  |  {item.escalationCount} escalation(s)</span></button><div className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.isOverdue ? 'bg-rose-500/10 text-rose-600' : 'bg-amber-500/10 text-amber-700'}`}>{item.isOverdue ? `${item.hoursOverdue}h overdue` : 'Due soon'}</span>{data?.permissions.canEscalate && item.isOverdue && <button type="button" onClick={() => escalateMutation.mutate(item.id)} disabled={escalateMutation.isPending} className={subtleButtonClass}>Escalate</button>}</div></div>;
            })}</div>}
            <p className="mt-3 text-[10px] leading-4 text-muted-foreground">Escalation records an auditable event and updates the escalation counter. It never approves, rejects or otherwise changes the decision status.</p>
          </div>

          <div className={panelClass}>
            <div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Governance audit trail</h3><p className="mt-1 text-[11px] text-muted-foreground">Recent policy, delegation, approval and escalation events.</p></div><CheckCircle2 className="h-4 w-4 text-muted-foreground" /></div>
            {(data?.events ?? []).length === 0 ? <p className="text-xs text-muted-foreground">No governance events recorded yet.</p> : <div className="space-y-2">{(data?.events ?? []).map((event) => <div key={event.id} className="rounded-xl border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold capitalize">{eventLabel(event.eventType)}</p><span className="text-[10px] text-muted-foreground">{dateLabel(event.createdAt)}</span></div><p className="mt-1 text-[11px] text-muted-foreground">{event.actorName || event.actorEmail || 'Organisation user'}{event.representedUserName ? ` acting for ${event.representedUserName}` : ''}{event.decisionTitle ? `  |  ${event.decisionTitle}` : ''}</p>{event.note && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-foreground/80">{event.note}</p>}</div>)}</div>}
          </div>
        </>
      )}
    </section>
  );
}