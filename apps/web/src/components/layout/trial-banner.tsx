'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { trialDaysLeft, usePlan } from '@/hooks/use-plan';
import { cn } from '@/lib/utils';

/** One quiet line under the top bar while trialing; stronger once the trial has ended. */
export function TrialBanner() {
  const pathname = usePathname();
  const { data: plan } = usePlan();
  if (!plan || pathname.startsWith('/billing')) return null;

  const days = trialDaysLeft(plan);
  const expired = plan.status === 'expired';
  if (!expired && days === null) return null;

  const urgent = expired || (days ?? 99) <= 3;
  return (
    <div
      role="status"
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-center text-sm',
        urgent ? 'border-warning/30 bg-warning/10 text-foreground' : 'border-border bg-muted/40 text-muted-foreground',
      )}
    >
      <span>
        {expired
          ? 'Your free trial has ended. Your data is kept, but workspace features are paused.'
          : days === 0
            ? 'Your free trial ends today.'
            : `${days} ${days === 1 ? 'day' : 'days'} left in your free trial.`}
      </span>
      <Link href="/billing" className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">
        {expired ? 'Choose a plan' : 'See plans'}
      </Link>
    </div>
  );
}
