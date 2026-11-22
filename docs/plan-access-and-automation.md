# Plan access and governed automation — 20 November 2026

## Approved product policy

| Plan | Agents | Advanced financial intelligence | Business Twin | Advanced approval policies/delegation |
| --- | --- | --- | --- | --- |
| Free / inactive / unknown | None | Locked | Locked | Locked |
| Starter | Chief of Staff, Integration Engineer | Locked | Locked | Locked |
| Growth | Starter agents plus Operations Manager | Included | Locked | Locked |
| Professional | All five, including Financial Analyst and Sales Development | Included | Included | Included |

Basic security, audit/access review and existing action approval enforcement remain available independently of advanced governance. Role permissions, provider configuration and supported tools still restrict entitled agents. Enterprise remains coming soon. This change does not alter prices, token quotas, storage limits or actual subscriptions.

## Reuse and implementation inventory

- API billing/plan-policy.ts and entitlements.ts: shared fail-closed subscription policy and authenticated entitlement endpoint. No client-supplied tenant selection. Active/trialing subscriptions only; cancelled/unknown plans do not grant access.
- API agents/agent-runs.service.ts and agent-evidence.service.ts: entitlement checks on agent admission, worker execution and proposal application; financial evidence gated. Existing durable runs, queues, usage controls, approvals and tenant-scoped actor lookup remain authoritative.
- API executive-intelligence controllers, workspace/twin-market.controller.ts, knowledge/knowledge-decisions.controller.ts: authenticated feature checks for advanced features. API authorization remains independent of frontend rendering.
- Web components/plan-access.tsx, dashboard layout, decision governance panel, agent command center and billing: matching feature locks and Upgrade links, named agent allowances.
- Web hooks/use-auth.ts and components/layout/luie-refresh-listener.tsx: cancel and clear old queries on login/registration; synchronization polling follows the current tenant and user, ignoring obsolete responses after cleanup. Existing tenant-filtered LUIE change feed and workflow workers reused.
- Standalone /marketing-intelligence page and its CSS removed from routes/navigation/search. Source records, campaign import and analytics remain available through existing modules.
- API workflows/business-templates.ts and workflows.controller.ts; web workflows/business-templates.tsx: four reviewable support/onboarding/HR/sales coordination templates using existing inactive draft creation. AI drafting links use the existing Chief of Staff mission interface.

No new database migrations or competing workflow engine. No production subscription changed by verification. Existing unrelated working-tree changes preserved.

## Verification evidence

Executed against this development environment:
- API TypeScript check: passed.
- Web TypeScript check after regenerating Next route types: passed (see final verification output).
- API Nest production build with a scratch output directory: passed.
- Web Next production build in a scratch copy using repository dependencies: passed; final source changes rebuilt separately.
- Jest plan-policy, entitlements, business-templates, existing agent approval, workflow and LUIE change-feed tests: passed.
- Jest billing.service, ai.service, knowledge-retrieval.service, jwt.strategy and tasks.service regression suites: 56 tests passed.
- agent-workforce-postgres.smoke.cjs: passed in a rolled-back PostgreSQL fixture, including Starter/Growth/Pro boundaries, downgrade denial, cross-tenant run access, all five persisted agent runs with a deterministic test provider, existing goal/approval idempotency, briefing follow-up replay and validated source/process checks.
- git diff --check: passed.

Builds validate compilation and route generation. They are not browser usability tests. The PostgreSQL fixture uses a test AI provider; it does not establish live model quality or successful external delivery.

## Operator checks

1. Sign in to a Starter organization as an authorized manager: /agent-command offers Chief of Staff and Integration Engineer; other agents show Upgrade. /business-twin and /executive-intelligence display Upgrade.
2. Growth adds Operations Manager and /executive-intelligence; Business Twin and advanced policy/delegation remain locked.
3. Professional allows all five agents and implemented premium features, subject to role/provider permissions. Basic /security/governance access review remains available on every tier.
4. /workflows: create a template, inspect the inactive draft and task steps, then use Draft with AI to prepare a sourced plan. Review before using existing activation controls.
5. Switch accounts through logout/login and confirm old account data is absent; permitted LUIE changes refresh active queries.
6. Use authorized existing provider setup for real model calls, OAuth synchronization and approved outreach. Never paste provider secrets into missions.

## Remaining limits

These changes strengthen and test selected tenant boundaries; they do not prove exhaustive whole-application isolation or synchronization coverage for every event. No live external-provider end-to-end test or browser walkthrough was performed in this change.

The four new templates coordinate review tasks. They do not autonomously answer support tickets, provision accounts, make HR decisions or send sales outreach. AI drafting uses configured existing agents and approved connectors; a consulting rollout plan is an AI planning entry point, not a staffed consulting service.

No SSO/provisioning, new connector or external-action capability is implied. Existing provider credentials, source data, Redis, PostgreSQL and required pre-existing migrations must be configured according to the agent rollout documentation. No new secret environment variable is required.
