'use client';
import Link from 'next/link';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { ErrorState, Skeleton } from '@/components/ui/primitives';
import { routeAccess, usePlan } from '@/hooks/use-plan';

function Locked({ title, body }: { title: string; body: string }) {
  return (
    <section className="mx-auto mt-10 max-w-md rounded-xl border border-border bg-card p-8 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-muted text-muted-foreground">
        <LockKeyhole className="h-4 w-4" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p>
      <Link href="/billing" className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
        See plans <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

/** Page-level gate driven by the same entitlements the API enforces. */
export function RouteGate({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const { data: plan } = usePlan();
  const access = routeAccess(pathname, plan);
  if (access.allowed) return <>{children}</>;
  if (access.reason === 'expired') {
    return <Locked title="Your free trial has ended" body="Your data is safe. Choose a plan to pick up where you left off. Billing, settings, security and data export stay available." />;
  }
  return <Locked title={`Available on ${access.minPlan}`} body={`This part of Lumorius is included from the ${access.minPlan} plan upward.`} />;
}

/** Feature gate for a section inside a page (for example decision governance). */
export default function PlanAccess({ feature, children }: { feature: string; children: React.ReactNode }) {
  const query = usePlan();
  if (query.isPending) {
    return (
      <div role="status" aria-label="Checking workspace access" className="space-y-3">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState className="mx-auto max-w-xl" title="Could not check plan access" onRetry={() => void query.refetch()} />;
  }
  if (!query.data.features.includes(feature)) {
    return query.data.status === 'expired'
      ? <Locked title="Your free trial has ended" body="Choose a plan to keep using this feature." />
      : <Locked title="Not included in your plan" body="Upgrade to unlock this feature." />;
  }
  return <>{children}</>;
}
