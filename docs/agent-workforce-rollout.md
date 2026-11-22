# Lumorius AI workforce rollout

The workforce lives inside AI Advisor. PostgreSQL is authoritative for missions, proposals and outcomes. Bull delivers work and LUIE delivers notifications after completion. Decision Intelligence owns approvals. Billing owns entitlements and AI token accounting.

| Capability | Existing owner | Extension |
|---|---|---|
| Agent runtime | AI Advisor, Bull, AI service | Permanent run state, history, evidence, retries at delivery, provider usage, cancellation, and link-only notifications. |
| Knowledge and briefing | Company Brain, Chief of Staff | Access-scoped source retrieval; existing daily and weekly reminders now also support monthly delivery. |
| Goal execution | Decision Intelligence, Founder OS, Tasks | Review an immutable version, approve the linked decision, and apply objectives, key results, assigned tasks and receipts in one transaction. Shared goals exclude restricted document and team evidence. |
| Connector diagnostics | Integrations | Real connector availability and setup findings. Authorization and sync remain in Integrations. Your billing provider is separate. |
| Financial intelligence | Executive Intelligence | Validated and reconciled cash uploads; deterministic forecasts per currency with a historical comparison. |
| Operations intelligence | Workflows | Actual runs, failures, retries, elapsed times, observed paths and step waits. The Operations agent uses the same read-only sample. |
| CRM evidence | Integrations, Company Brain | HubSpot and Salesforce snapshot metadata tied to the current authorization and existing document record; committed pipeline data is a fallback. Sales analysis and drafts do not send messages. |
| External markets | Business Twin | Separate Simulation, Market Monitor and Market Research views. Coinbase OHLCV history, ECB daily FX references through Frankfurter, optional Twelve Data equities/intraday FX, and published World Bank country indicators with a dated offline archive. |
| Marketing | Executive Intelligence, Analytics | Campaign import through the existing staging and commit process. Campaign economics and AI strategy drafting keep known inputs separate from assumptions. |

## Local verification

1. Apply `database/schema/028_agent_workforce.sql` and `database/schema/029_key_result_measured_baseline.sql` after the existing Executive Intelligence, LUIE, Integrations, Workflows and unified workspace migrations. If prior migrations were applied manually and the ledger is incomplete, reconcile against a database copy before replaying historical migrations.
2. Use an active or trialing Starter, Growth or Professional subscription with a workspace manager or administrator. Redis and the existing API AI provider must be configured. `LUMORIUS_ENABLED_AGENTS` defaults to all five agents, subject to subscription entitlements and user permissions; an empty string pauses agent startup and proposal execution. Optional `LUMORIUS_AGENT_MODEL` overrides the inherited model. Other staged IDs are `integration-engineer`, `financial-analyst`, `operations-manager`, and `sales-development`.
3. In **Agent Command Center** choose **Draft goals and tasks**. Run and submit the proposal to Decisions. An authorized reviewer opens the review link from the decision, checks that version and uses the normal approval action. In the initiator run, refresh and apply the approved proposal. Applying again returns the same record links.
4. In **Executive Intelligence → Data sources**, upload, map, validate and commit a cash or campaign CSV/XLSX. Cash requires one reconciled row per currency and completed month. **Financials** projects cash after three consecutive reconciled months and adds the 12-month horizon only if twelve months reconcile. **Analytics → Marketing Intelligence** shows CAC, ROAS and conversion only when the required counts, spend, or attribution are present.
5. Inspect recorded **Process performance** in Workflows. Use **Market research** in Business Twin to retrieve published country indicators. The Marketing Intelligence strategy link opens Agent Command Center with a marketing mission and optional country selection. Authorize and synchronize the selected CRM in Integrations before testing Sales agent evidence.

## Implementation inventory and evidence

- API: `apps/api/src/agents` (run worker, evidence registry, artifact validation, API, approvals, and notification consumer). Existing application modules gained scoped work adapters and routes for processing time, forecasts and campaign analytics.
- Web: AI Advisor, Decisions, Chief of Staff and Founder OS expose the governed workflow. Executive Intelligence, Analytics, Workflows and Business Twin show the new validated data views.
- Database: local ledger records `028_agent_workforce` and `029_key_result_measured_baseline`. No live subscription was created or changed. Business fixtures run in a transaction that always rolls back.
- Verification: 105 targeted Jest tests passed. The PostgreSQL fixture checked cross-organization denial, required review, repeat execution, unknown baselines, import-to-metric calculations, monthly scheduling, and idempotent notifications. API and web type checks passed. Independent lint remains blocked by the repository lint configuration.

## Market data and process explorer

- Open `/business-twin?view=monitor` to switch instruments and date ranges. Candles and volume come from the provider. ECB references are daily close-only observations. Use the arrow keys on the chart or open the data table. Only Twelve Data symbols require `TWELVE_DATA_API_KEY`.
- Open `/business-twin?view=research` to see published annual indicators. When the World Bank API is unavailable the API uses the last successful retrieval or the bundled archive and discloses its date. The archive contains 10 available annual observations per country and indicator when published. Rebuild it from each World Development Indicators CSV export at `https://api.worldbank.org/v2/en/indicator/{indicatorId}?downloadformat=csv`; preserve the dataset update date and retrieval timestamp. No API credentials are needed for the archive.
- Open `/agent-command` for agent missions; existing AI Advisor deep links redirect to the same run or review. A country can pass directly from Market Research into a strategy mission.
- In Workflows → Process performance, select a workflow to see its top recorded paths and step timings. The view samples the latest 1,000 executions in the last 30 days; runs without logged steps remain in the coverage denominator. This release adds no database migration.
- Sales draft evidence ranks confirmed open CRM deals by recorded inactivity and expected-close dates. Explain the reasons before using the score. It is a timing signal for human review; contact consent, customer interest and permission to send still require separate evidence.

## Release boundaries

The core runtime and first approval-to-execution path are implemented. Remaining release work includes full integration field mapping and live OAuth verification, workflow simulation, configurable CRM qualification and outreach review workflows, monitored competitor watchlists, portfolio and Gantt planning, automatic KPI-to-OKR progress, and multi-agent delegation. Sales is intentionally draft-only; external sending is a separate release. Keep each pilot disabled until its data and credentials have been verified.

Run the rollback-only acceptance fixture from `apps/api` with `node src/test/agent-workforce-postgres.smoke.cjs`. It uses a test AI response and does not send requests to external providers.

Monitor queue lag, interrupted and failed runs, AI usage and pricing coverage, and failed LUIE deliveries. Release checks should include actual browser/provider verification as well as the database and automated test checks.
