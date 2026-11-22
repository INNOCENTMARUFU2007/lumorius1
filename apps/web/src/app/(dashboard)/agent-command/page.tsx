import Link from 'next/link';
import { Activity, ArrowUpRight, Bot } from 'lucide-react';
import AgentCommandCenter from '../ai/agent-command-center';
import { PageHeader } from '@/components/ui/primitives';
import { AiModelPicker } from '@/components/ai-model-picker';

export default function AgentCommandPage() {
  return <div className="mx-auto w-full max-w-[1530px] space-y-5">
    <PageHeader
      hero
      icon={Bot}
      title="AI Agents"
      description="Launch missions, inspect their evidence, and send proposed changes to Decisions for approval. Agents never act outside your approval rules."
      actions={
        <nav aria-label="Related workspaces" className="flex flex-wrap gap-2">
          <Link className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card/60 px-3.5 text-sm font-medium transition hover:bg-muted" href="/ai">AI Advisor <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          <Link className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card/60 px-3.5 text-sm font-medium transition hover:bg-muted" href="/chief-of-staff"><Activity className="h-3.5 w-3.5" /> Chief of Staff</Link>
        </nav>
      }
    />
    <section aria-label="AI engine for agents" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div>
        <p className="text-sm font-medium">AI engine</p>
        <p className="text-sm text-muted-foreground">Every agent runs on this provider and model. A mission only runs when you launch it.</p>
      </div>
      <AiModelPicker compact />
    </section>
    <AgentCommandCenter dedicated />
  </div>;
}
