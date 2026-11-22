
'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Users,
  Plus,
  Mail,
  Crown,
  Shield,
  User,
  Trash2,
  Clock,
  RefreshCw,
  CalendarDays,
  Copy,
} from 'lucide-react';
import api from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

type TeamMember = Record<string, unknown> & {
  user_id: string;
  email?: string;
  full_name?: string;
  role?: string;
  avatar_url?: string | null;
  last_login_at?: string | null;
};

type InvitationRecord = {
  id: string;
  email: string;
  role: string;
  team_id?: string | null;
  status: string;
  created_at?: string | null;
  expires_at?: string | null;
  accepted_at?: string | null;
};

type TeamData = {
  members: TeamMember[];
  seats?: {
    used: number;
    max: number | null;
  };
};

const ROLE_META: Record<
  string,
  { label: string; color: string; icon: LucideIcon }
> = {
  owner: {
    label: 'Owner',
    color: 'text-amber-500 bg-amber-500/10',
    icon: Crown,
  },
  admin: {
    label: 'Admin',
    color: 'text-red-500 bg-red-500/10',
    icon: Shield,
  },
  member: {
    label: 'Member',
    color: 'text-blue-500 bg-blue-500/10',
    icon: User,
  },
  viewer: {
    label: 'Viewer',
    color: 'text-gray-500 bg-gray-500/10',
    icon: User,
  },
};

function getErrorMessage(error: unknown): string {
  const err = error as {
    response?: {
      data?: {
        message?: string | string[];
        error?: string;
      };
    };
    message?: string;
  };

  const message = err?.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  if (typeof err?.response?.data?.error === 'string') {
    return err.response.data.error;
  }

  return err?.message || 'An unexpected error occurred. Please try again.';
}

function formatDate(value?: string | null): string {
  if (!value) return 'Unavailable';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unavailable';
  }

  return date.toLocaleString();
}

async function copyUserId(userId: string) {
  try {
    await navigator.clipboard.writeText(userId);
    toast.success('User ID copied');
  } catch {
    toast.error('Clipboard access is unavailable. Select the ID to copy it manually.');
  }
}

function normalizeMembers(payload: unknown): TeamData {
  const value = payload as
    | {
        members?: unknown;
        seats?: { used: number; max: number | null };
      }
    | unknown[]
    | null;

  const rawMembers: Record<string, unknown>[] = Array.isArray(value)
    ? (value as Record<string, unknown>[])
    : value &&
        typeof value === 'object' &&
        Array.isArray(value.members)
      ? (value.members as Record<string, unknown>[])
      : [];

  const members: TeamMember[] = rawMembers.map((member) => {
    const email =
      typeof member.email === 'string' ? member.email : undefined;

    const fullName =
      typeof member.full_name === 'string' && member.full_name.trim()
        ? member.full_name
        : typeof member.name === 'string' && member.name.trim()
          ? member.name
          : email || 'Unknown user';

    return {
      ...member,
      user_id: String(member.user_id ?? member.id ?? ''),
      email,
      full_name: fullName,
      role: typeof member.role === 'string' ? member.role : 'member',
      avatar_url:
        typeof member.avatar_url === 'string'
          ? member.avatar_url
          : null,
      last_login_at:
        typeof member.last_login_at === 'string'
          ? member.last_login_at
          : null,
    };
  });

  const seats =
    value &&
    !Array.isArray(value) &&
    typeof value === 'object' &&
    'seats' in value
      ? value.seats
      : undefined;

  return {
    members,
    seats: seats as TeamData['seats'],
  };
}

function normalizeInvitations(payload: unknown): InvitationRecord[] {
  const value = payload as
    | {
        invitations?: unknown;
      }
    | unknown[]
    | null;

  const rows: Record<string, unknown>[] = Array.isArray(value)
    ? (value as Record<string, unknown>[])
    : value &&
        typeof value === 'object' &&
        Array.isArray(value.invitations)
      ? (value.invitations as Record<string, unknown>[])
      : [];

  return rows
    .map((item): InvitationRecord => ({
      id: String(item.id ?? ''),
      email: typeof item.email === 'string' ? item.email : 'Unknown email',
      role: typeof item.role === 'string' ? item.role : 'member',
      team_id: typeof item.team_id === 'string' ? item.team_id : null,
      status:
        typeof item.status === 'string' ? item.status : 'unknown',
      created_at:
        typeof item.created_at === 'string' ? item.created_at : null,
      expires_at:
        typeof item.expires_at === 'string' ? item.expires_at : null,
      accepted_at:
        typeof item.accepted_at === 'string' ? item.accepted_at : null,
    }))
    .sort((a, b) => {
      const dateA = a.created_at
        ? new Date(a.created_at).getTime()
        : 0;
      const dateB = b.created_at
        ? new Date(b.created_at).getTime()
        : 0;

      return dateB - dateA;
    });
}

function InvitationStatus({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  const styles =
    normalized === 'accepted'
      ? 'text-green-600 bg-green-500/10'
      : normalized === 'expired'
        ? 'text-red-500 bg-red-500/10'
        : normalized === 'pending'
          ? 'text-amber-500 bg-amber-500/10'
          : 'text-muted-foreground bg-muted';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize ${styles}`}
    >
      {normalized}
    </span>
  );
}

export default function TeamPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();

  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');

  // Fetch active members independently of invitation history.
  const {
    data: teamData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<TeamData>({
    queryKey: ['team', 'members'],
    queryFn: async () => {
      const response = await api.get('/organizations/members');
      const payload = response.data?.data ?? response.data;

      return normalizeMembers(payload);
    },
  });

  // Fetch all invitations, including accepted and expired invitations.
  const {
    data: history = [],
    isLoading: historyLoading,
    isError: historyIsError,
    error: historyError,
    refetch: refetchHistory,
  } = useQuery<InvitationRecord[]>({
    queryKey: ['team', 'invitations'],
    queryFn: async () => {
      const response = await api.get('/organizations/me/invitations');
      const payload = response.data?.data ?? response.data;

      return normalizeInvitations(payload);
    },
  });

  const inviteMut = useMutation({
    mutationFn: async (body: { email: string; role: string }) => {
      const normalizedEmail = body.email.trim().toLowerCase();

      const response = await api.post('/organizations/me/invite', {
        email: normalizedEmail,
        role: body.role,
      });

      return response.data;
    },
    onSuccess: async () => {
      setEmail('');
      setShowInvite(false);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ['team', 'members'] }),
        qc.invalidateQueries({ queryKey: ['team', 'invitations'] }),
      ]);
    },
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/organizations/members/${userId}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['team', 'members'] });
    },
  });

  const members = teamData?.members ?? [];
  const pending = history.filter(
    (invitation) => invitation.status.toLowerCase() === 'pending',
  );
  const seatInfo = teamData?.seats;

  const normalizedEmail = email.trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
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
          type="button"
          onClick={() => {
            setShowInvite(true);
            inviteMut.reset();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Invite Member
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

          <form
            onSubmit={(event) => {
              event.preventDefault();

              if (!validEmail || inviteMut.isPending) return;

              inviteMut.mutate({
                email: normalizedEmail,
                role,
              });
            }}
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label
                  htmlFor="invite-email"
                  className="text-xs text-muted-foreground mb-1 block"
                >
                  Email address
                </label>

                <input
                  id="invite-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (inviteMut.isError) inviteMut.reset();
                  }}
                  placeholder="colleague@company.com"
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
              </div>

              <div className="sm:w-36">
                <label
                  htmlFor="invite-role"
                  className="text-xs text-muted-foreground mb-1 block"
                >
                  Role
                </label>

                <select
                  id="invite-role"
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>

            {inviteMut.isError && (
              <div
                role="alert"
                className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500"
              >
                <p className="font-medium">Invitation failed</p>
                <p>{getErrorMessage(inviteMut.error)}</p>
              </div>
            )}

            {inviteMut.isSuccess && (
              <p className="mt-3 text-sm text-green-600">
                Invitation sent successfully.
              </p>
            )}

            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                disabled={!validEmail || inviteMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Mail className="w-4 h-4" />
                {inviteMut.isPending ? 'Sending…' : 'Send Invite'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowInvite(false);
                  inviteMut.reset();
                }}
                className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Active members */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <h2 className="font-semibold">
            Active Members ({members.length})
          </h2>

          {isError && (
            <button
              type="button"
              onClick={() => void refetch()}
              className="flex items-center gap-1.5 text-sm text-violet-500 hover:text-violet-400"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          )}
        </div>

        {isError && (
          <div
            role="alert"
            className="px-5 py-4 text-sm text-red-500 bg-red-500/5"
          >
            Failed to load team members: {getErrorMessage(error)}
          </div>
        )}

        <div className="divide-y divide-border">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-4 px-5 py-4"
              >
                <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-muted rounded w-32 animate-pulse" />
                  <div className="h-3 bg-muted rounded w-48 animate-pulse" />
                </div>
              </div>
            ))
          ) : !isError && members.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No team members were returned by the API.
            </p>
          ) : (
            members.map((member) => {
              const memberRole = member.role ?? 'member';
              const roleMeta = ROLE_META[memberRole] ?? ROLE_META.member;
              const RoleIcon = roleMeta.icon;

              const displayName =
                member.full_name?.trim() || member.email || 'Unnamed';

              const initials = displayName
                .split(/\s+/)
                .filter(Boolean)
                .map((part) => part[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);

              return (
                <motion.div
                  key={member.user_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors"
                >
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      className="w-9 h-9 rounded-full object-cover"
                      alt=""
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                      {initials || '?'}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{displayName}</p>
                    <p className="text-xs text-muted-foreground break-all">
                      {member.email}
                    </p>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5">
                      <code className="min-w-0 break-all text-xs leading-4 text-muted-foreground">
                        ID: {member.user_id}
                      </code>
                      <button
                        type="button"
                        aria-label={`Copy user ID for ${displayName}`}
                        title="Copy user ID"
                        onClick={() => void copyUserId(member.user_id)}
                        className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${roleMeta.color}`}
                    >
                      <RoleIcon className="w-3 h-3" />
                      {roleMeta.label}
                    </span>

                    <span className="hidden sm:inline text-xs text-muted-foreground">
                      {member.last_login_at
                        ? formatRelative(member.last_login_at)
                        : 'Never'}
                    </span>

                    {member.user_id !== String(me?.id ?? '') &&
                      memberRole !== 'owner' && (
                        <button
                          type="button"
                          aria-label={`Remove ${displayName}`}
                          disabled={removeMut.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove ${displayName} from this workspace?`,
                              )
                            ) {
                              removeMut.mutate(member.user_id);
                            }
                          }}
                          className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {removeMut.isError && (
          <p role="alert" className="px-5 py-3 text-sm text-red-500">
            Failed to remove member: {getErrorMessage(removeMut.error)}
          </p>
        )}
      </div>

      {/* Pending invitations */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-amber-500 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pending Invitations ({pending.length})
          </h2>
        </div>

        {historyLoading ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            Loading pending invitations…
          </p>
        ) : pending.length === 0 ? (
          <p className="px-5 py-6 text-sm text-center text-muted-foreground">
            There are no pending invitations.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {pending.map((invitation) => (
              <div
                key={invitation.id}
                className="flex flex-wrap items-start gap-3 px-5 py-4"
              >
                <Mail className="w-4 h-4 mt-1 text-muted-foreground" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium break-all">
                    {invitation.email}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 capitalize">
                    Role: {invitation.role}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Invited: {formatDate(invitation.created_at)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Expires: {formatDate(invitation.expires_at)}
                  </p>
                </div>

                <InvitationStatus status={invitation.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Complete invitation history */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">
              Invitation History ({history.length})
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Invitations sent to members of your organisation, including
              accepted and expired invitations.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refetchHistory()}
            disabled={historyLoading}
            className="flex items-center gap-2 text-sm text-violet-500 hover:text-violet-400 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>

        {historyIsError ? (
          <div
            role="alert"
            className="px-5 py-5 text-sm text-red-500 bg-red-500/5"
          >
            <p className="font-medium">
              Could not load invitation history.
            </p>
            <p className="mt-1">
              {getErrorMessage(historyError)}
            </p>
            <p className="mt-2 text-muted-foreground">
              Check that the API route
              {' '}
              <code>/api/v1/organizations/me/invitations</code>
              {' '}
              exists and that the API server has been restarted.
            </p>
          </div>
        ) : historyLoading ? (
          <div className="px-5 py-8 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted rounded w-40 animate-pulse" />
                  <div className="h-3 bg-muted rounded w-56 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Mail className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">
              No invitation history found
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Invitations will appear here once they are recorded by the API.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {history.map((invitation) => (
              <div
                key={invitation.id}
                className="flex flex-wrap items-start gap-3 px-5 py-4 hover:bg-muted/20 transition-colors"
              >
                <div className="w-9 h-9 flex-shrink-0 rounded-full bg-violet-500/10 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-violet-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium break-all">
                    {invitation.email}
                  </p>

                  <p className="text-xs text-muted-foreground mt-1 capitalize">
                    Role: {invitation.role}
                  </p>

                  <div className="mt-2 space-y-1">
                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>
                        Date invited: {formatDate(invitation.created_at)}
                      </span>
                    </p>

                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>
                        Expires: {formatDate(invitation.expires_at)}
                      </span>
                    </p>

                    {invitation.accepted_at && (
                      <p className="text-xs text-green-600">
                        Accepted: {formatDate(invitation.accepted_at)}
                      </p>
                    )}
                  </div>
                </div>

                <InvitationStatus status={invitation.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
