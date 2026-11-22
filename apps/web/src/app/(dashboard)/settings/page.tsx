
'use client';

import Link from 'next/link';

import { useState } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Settings,
  Users,
  Building2,
  Shield,
  Mail,
  LifeBuoy,
  ExternalLink,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { AiModelPicker } from '@/components/ai-model-picker';

type UsageItem = {
  label: string;
  used: number | null;
  limit: number | null;
  suffix?: string;
};

type ApiRecord = Record<string, unknown>;

type UsageMetric = {
  used?: number | string | null;
  limit?: number | string | null;
};

type UsageData = {
  users?: UsageMetric;
  storage?: {
    usedGb?: number | string | null;
    limitGb?: number | string | null;
  };
  aiRequests?: UsageMetric;
};

function isRecord(value: unknown): value is ApiRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Supports responses such as:
 * { users: ... }
 * { data: { users: ... } }
 * { data: { data: { users: ... } } }
 */
function unwrapData(payload: unknown): unknown {
  let current = payload;

  for (let depth = 0; depth < 5; depth += 1) {
    if (
      isRecord(current) &&
      Object.prototype.hasOwnProperty.call(current, 'data')
    ) {
      current = current.data;
    } else {
      break;
    }
  }

  return current;
}

function normalizeRecord(
  payload: unknown,
  nestedKeys: string[] = [],
): ApiRecord {
  let current = unwrapData(payload);

  if (isRecord(current)) {
    for (const key of nestedKeys) {
      if (isRecord(current[key])) {
        current = unwrapData(current[key]);
        break;
      }
    }
  }

  if (!isRecord(current)) {
    throw new Error(
      'The API returned an unexpected response format.',
    );
  }

  return current;
}

function readString(
  record: ApiRecord | undefined,
  ...keys: string[]
): string | null {
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function toNumber(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (isRecord(error)) {
    const response = error.response;

    if (isRecord(response) && isRecord(response.data)) {
      const message = response.data.message;

      if (typeof message === 'string' && message.trim()) {
        return message;
      }

      if (
        Array.isArray(message) &&
        message.every((item) => typeof item === 'string')
      ) {
        return message.join(', ');
      }
    }

    if (
      typeof error.message === 'string' &&
      error.message.trim()
    ) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');

  // Safely handle incomplete user profiles.
  const profileName =
    typeof user?.name === 'string' && user.name.trim()
      ? user.name.trim()
      : typeof user?.email === 'string' && user.email.trim()
        ? user.email.trim()
        : 'User';

  const profileInitial = profileName.charAt(0).toUpperCase();

  const profileEmail =
    typeof user?.email === 'string' && user.email.trim()
      ? user.email
      : 'Email unavailable';

  const profileRole =
    typeof user?.role === 'string' && user.role.trim()
      ? user.role
      : 'Member';

  // Organisation query: one declaration, with a guaranteed valid return.
  const {
    data: org,
    isLoading: orgLoading,
    isError: orgError,
    error: orgQueryError,
    refetch: refetchOrg,
  } = useQuery<ApiRecord, Error>({
    queryKey: ['org'],
    queryFn: async () => {
      const response = await api.get<unknown>(
        '/organizations/me',
      );

      return normalizeRecord(response.data, [
        'organization',
        'org',
      ]);
    },
    retry: 1,
  });

  // Usage query: handles both direct and wrapped API responses.
  const {
    data: usageData,
    isLoading: usageLoading,
    isError: usageError,
    error: usageQueryError,
    refetch: refetchUsage,
  } = useQuery<UsageData, Error>({
    queryKey: ['org', 'usage'],
    queryFn: async () => {
      const response = await api.get<unknown>(
        '/organizations/me/usage',
      );

      let payload = unwrapData(response.data);

      if (isRecord(payload) && isRecord(payload.usage)) {
        payload = unwrapData(payload.usage);
      }

      if (!isRecord(payload)) {
        throw new Error(
          'The usage API returned an unexpected response format.',
        );
      }

      return payload as UsageData;
    },
    retry: 1,
  });

  const storageUsed = toNumber(usageData?.storage?.usedGb);

  const usageItems: UsageItem[] = [
    {
      label: 'Users',
      used: toNumber(usageData?.users?.used),
      limit: toNumber(usageData?.users?.limit),
    },
    {
      label: 'Storage',
      used:
        storageUsed === null
          ? null
          : Math.round(storageUsed * 10) / 10,
      limit: toNumber(usageData?.storage?.limitGb),
      suffix: 'GB',
    },
    {
      label: 'AI Requests',
      used: toNumber(usageData?.aiRequests?.used),
      limit: toNumber(usageData?.aiRequests?.limit),
    },
  ];

  const inviteMutation = useMutation({
    mutationFn: async () =>
      api.post('/organizations/me/invite', {
        email: inviteEmail.trim(),
        role: inviteRole,
      }),

    onSuccess: () => {
      toast.success(
        `Invitation sent to ${inviteEmail.trim()}`,
      );

      setInviteEmail('');

      queryClient.invalidateQueries({
        queryKey: ['org', 'usage'],
      });
    },

    onError: (error: unknown) => {
      toast.error(
        getErrorMessage(error, 'Failed to send invitation'),
      );
    },
  });

  const organisationName =
    readString(org, 'name', 'organization_name', 'organisation_name') ??
    'Unavailable';

  const organisationSlug =
    readString(org, 'slug') ?? 'Unavailable';

  const organisationPlan =
    readString(org, 'plan_name', 'plan') ?? 'Unavailable';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-gray-500/10 p-2">
          <Settings className="h-5 w-5 text-gray-500" />
        </div>

        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <Link href="/security/governance" className="mt-2 inline-block text-sm text-sky-600 hover:underline dark:text-sky-300">Privacy and data controls</Link>
          <p className="text-sm text-muted-foreground">
            Manage your organisation, usage, and profile.
          </p>
        </div>
      </div>

      {/* Organisation */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Organisation</h2>
        </div>

        {orgLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading organisation details…
          </p>
        ) : orgError ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-red-500">
              {getErrorMessage(
                orgQueryError,
                'Organisation details could not be loaded.',
              )}
            </p>

            <button
              type="button"
              onClick={() => {
                void refetchOrg();
              }}
              className="text-sm font-medium text-brand-500 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : org ? (
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Name</p>
              <p className="break-words font-medium">
                {organisationName}
              </p>
            </div>

            <div>
              <p className="text-muted-foreground">Slug</p>
              <p className="break-words font-mono font-medium">
                {organisationSlug}
              </p>
            </div>

            <div>
              <p className="text-muted-foreground">Plan</p>
              <p className="font-medium capitalize">
                {organisationPlan}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Organisation information is unavailable.
          </p>
        )}
      </section>

      {/* AI engine */}
      <section aria-labelledby="ai-settings-title" className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 id="ai-settings-title" className="font-semibold">AI</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Choose which AI runs your workspace: OpenAI or Anthropic Claude.</p>
        </div>
        <AiModelPicker showAutomation />
      </section>

      {/* Usage */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Usage</h2>
        </div>

        {usageLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading usage information…
          </p>
        ) : usageError ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-red-500">
              {getErrorMessage(
                usageQueryError,
                'Usage information could not be loaded.',
              )}
            </p>

            <button
              type="button"
              onClick={() => {
                void refetchUsage();
              }}
              className="text-sm font-medium text-brand-500 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : usageData ? (
          <div className="space-y-3">
            {usageItems.map(({ label, used, limit, suffix }) => {
              const percentage =
                used !== null && limit !== null && limit > 0
                  ? Math.min(100, (used / limit) * 100)
                  : 0;

              return (
                <div key={label}>
                  <div className="mb-1 flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {label}
                    </span>

                    <span className="text-right font-medium">
                      {used === null
                        ? 'Unavailable'
                        : `${used.toLocaleString()}${suffix ? ` ${suffix}` : ''}`}

                      {used !== null &&
                        (limit === null
                          ? ' (unlimited)'
                          : ` / ${limit.toLocaleString()}${suffix ? ` ${suffix}` : ''}`)}
                    </span>
                  </div>

                  {limit !== null && limit > 0 && used !== null && (
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all ${
                          percentage > 90
                            ? 'bg-red-500'
                            : percentage > 70
                              ? 'bg-yellow-500'
                              : 'bg-brand-500'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Usage information is unavailable.
          </p>
        )}
      </section>

      {/* Invite team members */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Invite Team Members</h2>
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();

            if (inviteEmail.trim()) {
              inviteMutation.mutate();
            }
          }}
        >
          <input
            value={inviteEmail}
            onChange={(event) =>
              setInviteEmail(event.target.value)
            }
            placeholder="colleague@company.com"
            type="email"
            required
            autoComplete="email"
            className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          <select
            value={inviteRole}
            onChange={(event) =>
              setInviteRole(event.target.value)
            }
            aria-label="Invitation role"
            className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none"
          >
            {['viewer', 'member', 'manager', 'admin'].map(
              (role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ),
            )}
          </select>

          <button
            type="submit"
            disabled={
              !inviteEmail.trim() || inviteMutation.isPending
            }
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {inviteMutation.isPending ? 'Sending…' : 'Invite'}
          </button>
        </form>
      </section>

      {/* Contact support */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-brand-500/10 p-2">
            <LifeBuoy className="h-4 w-4 text-brand-500" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-semibold">Need help?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Contact Lumorius Support for account or workspace assistance.
            </p>
          </div>
        </div>
        <a
          href="mailto:support@lumorius.com?subject=Lumorius%20support%20request"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-muted"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          Contact support
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </a>
      </section>

      {/* Profile */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Your Profile</h2>
        </div>

        {user ? (
          <div className="flex items-center gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white"
              aria-label={`Profile initial: ${profileInitial}`}
            >
              {profileInitial}
            </div>

            <div className="min-w-0">
              <p className="break-words font-semibold text-foreground">
                {profileName}
              </p>

              <p className="break-words text-sm text-muted-foreground">
                {profileEmail}
              </p>

              <span className="mt-1 inline-block rounded-full bg-brand-100 px-2 py-0.5 text-xs capitalize text-brand-700">
                {profileRole}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Profile information is currently unavailable.
          </p>
        )}
      </section>
    </div>
  );
}
