# Lumorius UI transformation — progress record

Date: 2026-11-21. Scope: `apps/web` only. No backend, API contract, or database changes.

## Design system

| Layer | File | What it holds |
| --- | --- | --- |
| Tokens | `apps/web/src/app/globals.css` | Semantic HSL tokens for light and dark (dark is the signature theme, now the default): background / deep / card / elevated surface, primary (Electric Indigo), violet, info (Intelligence Cyan), success, warning, destructive, border / border-strong, chart-1…5 and chart-grid, motion durations and easing. Component classes `lm-ambient`, `lm-panel`, `lm-panel-interactive`, `lm-glass`, `lm-hero`, `lm-eyebrow`, `lm-skeleton` (shimmer), `lm-enter`. Global `prefers-reduced-motion` override. |
| Tailwind | `apps/web/tailwind.config.ts` | Tokens exposed with opacity support (`bg-primary/10` etc.), new `success`, `warning`, `info`, `violet`, `surface-elevated`, `border-strong`, `chart.*` colours, `shadow-panel/elevated/glow-primary`, radius scale. `brand-*` remapped to the indigo scale (brand-500 = #6366F1). Legacy `gray-*` remapped to the cool slate scale. |
| Components | `apps/web/src/components/ui/primitives.tsx` | `PageHeader` (with hero variant), `Panel`, `SectionHeading`, `Skeleton`, `EmptyState`, `ErrorState`, `StatusBadge` (tones), `TrendIndicator`, `DataFreshness`, `SegmentedControl` (time ranges), `Sparkline` (pure SVG), `MetricCard`, `InsightList` (every insight labelled **Calculated**, **AI interpretation**, or **Data gap**), `ProgressBar`. Server-component safe (no hooks). |
| Charts | `apps/web/src/components/ui/chart.tsx` | `chartTheme` (series colours, grid, axis ticks, tooltip styling bound to tokens) and `ChartContainer` (title, period, source footnote, loading / error / empty states). |
| Navigation | `apps/web/src/lib/navigation.ts` | Single source of truth for nav groups, workspace items, platform-admin items and breadcrumb resolution. |

## Shell

* **Sidebar** — grouped (Overview, Execution, Insight, Management, Workspace), collapsible rail (persisted in `localStorage`, guarded with try/catch), tooltips when collapsed, gradient active indicator, unread badge from the real `/notifications/unread-count` endpoint, mobile drawer (Escape and route-change close it). Platform Admin still renders only for the platform admin, unchanged logic, and is still absent from the command palette.
* **Top bar** — breadcrumbs from the nav config, mobile menu button, command palette trigger, notifications, theme selector (Light / Dark / System), account menu.
* **Layout** — ambient background, skip-to-content link, `100dvh`, overflow-x guarded, consistent page gutters.
* **Command palette** — restyled with tokens; fixed mojibake in the empty-state hint; "Agent Command Center" relabelled "AI Agents".

## Pages

| Route | Change |
| --- | --- |
| `/dashboard` | Rebuilt as the executive command centre: hero with live deadline/indexing strip, metric cards (sparkline + period-over-period trend on task completions), themed area chart with 7D/30D/90D control and source footnote, **deterministic executive briefing** (only statements computed from page data; no AI-inferred causes), task status, document indexing and priority work panels, financial cards gated by role exactly as before. All queries and data rules preserved. |
| `/executive-intelligence` | Dark-only hex surfaces converted to tokens; works in light mode. Charts use the shared palette. Hero header. Double page padding removed. |
| `/billing`, `/security`, `/founder-os` | Previously dark-only (`bg-gray-900`, `text-white`) and unreadable in light mode; converted to tokens. Coloured buttons and plan gradients kept. |
| `/brain`, `/meetings`, `/workflows`, `/agent-command`, `/tasks`, `/decisions`, `/knowledge`, `/chief-of-staff`, `/integrations`, `/security/governance` | Bespoke per-page dark hero bands (teal, sky, indigo variants) replaced with the shared `PageHeader` hero so every module reads as one product. Nested page padding removed where the layout already pads. |
| `/ai` | Light-mode contrast fixes. |

## Not changed / deferred

* `/business-twin` (experimental, plan-gated, not in navigation) keeps its own dark styling.
* Inner content of the large module pages (Brain conversation workspace, Meeting detail tabs, Workflow editor, Decision timelines) was themed through tokens but not structurally redesigned.
* No new AI briefing endpoint exists; the dashboard briefing is deterministic by design.
* ESLint is not configured for `apps/web` (`next lint` prompts for first-time setup) — lint was not run.
* The sidebar's platform-admin check uses a client-side email comparison with a hard-coded fallback (pre-existing). Server-side admin guards are what actually protect `/admin` APIs; consider moving the flag to the `/auth/me` response.

## Validation

| Check | Result |
| --- | --- |
| `tsc --noEmit` (apps/web) | Pass, 0 errors |
| `next build` (apps/web) | Pass, all 32 routes compiled |
| `node --test workflows/studio-state.test.cjs` | 4/4 pass |
| ESLint | Not run — no ESLint config in apps/web |
| Visual check, signed in (2026-11-21) | Done against the local API with real workspace data. Port 3000 was held by an unresponsive Next process, so the web app ran on 3005 with `APP_URL=http://localhost:3005` set for the API process only (`.claude/launch.json`, `api-dist` entry). |

### Visual check results

* **Dark, 1440px:** Dashboard, Company Brain, Meetings, Workflows, Tasks, Decisions, Founder OS, Chief of Staff, Knowledge Graph, AI Agents, Integrations, Team, Billing, Security — consistent headers, panels and charts.
* **Light, 1440px:** Dashboard, Billing, Security, Founder OS, Settings — readable; the previously dark-only pages now render correctly.
* **390px:** Dashboard reflows to one column, no horizontal overflow, mobile drawer opens with all nav links.
* **768px:** no horizontal overflow (session expired before a screenshot; see below).

Issues found and fixed during the check:

1. Sidebar wordmark was invisible in light mode (the SVG text is near-white). Now icon + theme-aware text.
2. Dashboard "Financial performance" treated a plan-gated 403 ("Upgrade to unlock this feature") as a load failure and retried repeatedly. Now shows an upgrade prompt linking to Billing, with no retry on 403.
3. The plan gate (`PlanAccess`, used by Executive Intelligence and decision governance) was unstyled. Restyled with a skeleton while loading, an error state with retry, and an upgrade panel (heading demoted to h2 because it can appear inside a page).
4. Billing "Current Plan" badge was invisible in light mode on the plan gradient. Now white on translucent.

Environment notes (not frontend bugs): the local Postgres intermittently timed out on connections, producing bursts of 500s across all endpoints and eventually expiring the session. Animations run very slowly inside the test browser pane; normal browsers are unaffected.

Not visually checked: Executive Intelligence content (plan-locked for this account), Analytics, AI Advisor, Notifications content, Admin, Meeting detail, 1024px and 1920px widths.

## Round 3 — billing enforcement, trial, integrations, env, speed, charts (2026-11-21)

### Billing and plans (API)
* Single plan source: `organizations.plan_id` (kept in sync by the Dodo webhook, settable by platform admins) plus the 14-day trial window. `apps/api/src/billing/plan-policy.ts` defines plans, modules, features and agents.
* No free tier. New workspaces get `trial_ends_at = now() + 14 days` (fallback `created_at + 14 days`). Trial = Growth features with the trial allowance; expired = workspace modules locked (Billing, Settings, Security, Team, Notifications and data export stay open).
* Global `PlanModuleInterceptor` enforces `@RequiresModule(...)` on API controllers: `core` (Starter+), `workflows` and `decisions` (Growth+). Existing `@RequiresFeature` gates unchanged.
* Event- and schedule-triggered workflows do not fire for workspaces without the Workflows module.
* Seat limit enforced on invite (members + pending invitations). Document limit enforced inside the upload transaction.
* Catalogue (migration `apps/api/src/database/migrations/20261121_trial_and_plan_catalog.sql`, applied to the local DB only):
  Starter $49/$490 (5 seats, 200 docs, 10 GB, 250k tokens) · Growth $99/$990 (15, 1,000, 50 GB, 1M) · Professional $199/$1,990 (40, 5,000, 200 GB, 3M) · Trial (5, 50, 2 GB, 100k).
* Checkout needs Dodo keys and products at the same prices (`DODO_*` in `.env`).

### Integrations
* Removed: Salesforce, Intercom, Datadog, PagerDuty (sync code left in place but unreachable).
* Gmail and Google Drive (Google restricted scopes) are paid-plan only; blocked in list, connect and sync during the trial.

### Env
* Root `.env`: removed dead keys (Stripe price IDs, removed providers, duplicate Atlassian lines); added Dodo payment keys (empty) and `LUMORIUS_ADMIN_EMAIL`.
* `apps/api/.env` was never loaded; replaced with a pointer to the root file.
* New `apps/web/.env.local` with `NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL`; hard-coded admin email removed from the frontend.

### Speed
* `next dev --turbopack`; LUIE change-feed polling pauses in background tabs; Recharts loads after first paint on the dashboard.

### Design
* Removed gradient banners, glows, title icon tiles, uppercase eyebrows, sparkle icons; flat panels; IBM Plex Sans/Mono.
* Dashboard: composed completions chart (daily bars, 7-day average, period-average reference, comparison tooltip, zoom brush on 90 days), activity heatmap, stacked task-status bar.

### Verified in browser (signed in)
Dashboard (dark/light), Billing, Integrations, Workflows lock screen; API checks: removed integrations absent, `/workflows` returns 403 on Starter, entitlements report Starter.

### Note for the owner
The "Lumorius AI Enterprise" workspace is on Starter, so Workflows, Decisions and Executive Intelligence are now locked for it (its 5 workflows are kept but do not run). Change its plan in Platform Admin if it should have them.

## Round 4 — launch readiness (2026-11-22)

### Cleanup
* 84 backup/log/duplicate files moved out of the repository to `C:\Users\HomePC\lumorius-cleanup-20261121\` (list in `manifest.txt` there). Nothing permanently deleted. `vendor/` kept (pdfkit packages).

### Readability
* No text below 13px: `text-[9–12px]` → `text-xs` (now 13px), `text-[13px]` → `text-sm` (now 15px); tiny letter-spaced all-caps labels removed (46 places).

### Login and sign-up
* Login lists all 14 modules. Verify-email and onboarding showed two logos; both now show one theme-aware `BrandMark`.

### Uploads
* Company Brain uploads any number of files, four in parallel, with an "Uploading x of y" progress bar. Indexing worker runs four documents in parallel (was one).
* Uploads are checked by content signature, not just the declared type (PDF `%PDF-`, Office ZIP header, text without binary/HTML).

### AI providers and token control
* Providers: OpenAI (any chat model; reasoning models get the right parameters) and Anthropic (`claude-opus-5-5` default, `claude-sonnet-5-5`, `claude-haiku-5-5`). OpenRouter removed. Embeddings always OpenAI.
* Workspace choice stored in `organizations.settings.ai`; picker in Settings → AI and on the AI Agents page. `GET/PATCH /ai/settings` (owner/admin to change).
* Claude calls no longer send `temperature` (rejected by current models), leave room for adaptive thinking, and surface refusals clearly. The Anthropic SDK is 0.33.1; server-side refusal fallbacks need a newer SDK and are not enabled.
* AI no longer runs without a user action:
  - Founder OS commentary: was generated on every page load (and every 60 s refresh); now a "Generate commentary" button.
  - Knowledge Graph extraction: ran AI on every uploaded document; now only via "Sync documents" unless the workspace turns on automatic extraction in Settings → AI.

### Company Brain
* Chat window: conversation thread with your questions and cited AI answers, follow-ups keep context (last 4 turns sent to the API and used for retrieval), "New chat", per-answer sources, full evidence for the latest answer.

### Security review
* Tenant scan of all SQL touching tenant tables by id: no unscoped access found (5 candidates reviewed, all safe).
* Present: helmet, CORS allow-list, global validation (whitelist + forbid unknown fields), bcrypt, login lockout, rate limits, plan enforcement.

### Round 4 verification (2026-11-22)
* API tests 415/415 (64 suites) plus agent tests after the last change (12/12); API and web typecheck clean; production web build passes.
* Browser (signed in): Settings → AI and AI Agents picker render with both providers; Company Brain chat layout and multi-file picker; Founder OS loads with `includeInsights=false` and no AI call; login shows all 14 modules.
* Agent missions: the agent pipeline works up to the AI call (sources are read), but **both AI keys in `.env` are rejected by the providers (HTTP 401)** — OpenAI and Anthropic. No AI feature (agents, Brain answers, advisor, document indexing embeddings) can work until valid keys are set. Failed runs now log the cause and show "The AI provider rejected its API key" in the run history.
* Local slowness: Docker Desktop's Kubernetes control plane uses ~97% CPU with 3.7 GB for all containers, causing Postgres connection timeouts.

## Round 5 — launch fixes (2026-11-22)

* **AI models:** only GPT-4.1 (OpenAI) and Claude Haiku 5.5 (Anthropic) are offered and used everywhere; previously saved choices fall back to these. Keys shorter than 20 characters or containing placeholder text are treated as not configured (the Anthropic key in `.env` is a 10-character placeholder). New optional `OPENAI_BASE_URL` for OpenAI-compatible GPT-4.1 services. Agents always use the workspace model.
* **AI Agents:** "Run mission" is always clickable and explains what is missing (choose an agent, at least 8 characters, agent unavailable). Provider key rejections show a specific message.
* **Founder OS:** health radar redrawn in SVG with a value label on every axis, "No data" for unmeasured dimensions and a 0 score placed on its own axis. Team score now = members active this week (40%) + open tasks with an owner (30%) + open tasks on time (30%).
* **Tasks:** "Assign to" picker when creating a task (workspace members, "(me)" marked).
* **Financial imports:** blank spacer columns are ignored, blank headers over data become "Column X", duplicate headers are numbered — instead of rejecting the file.
* **Errors fixed:** token refresh is shared across simultaneous requests (rotation used to log users out); a session marker cookie keeps navigation working after the 15-minute access token expires; AI picker guarded against a missing provider list; change-feed polling no longer logs errors on every network blip.
* **Speed:** live updates refresh only the affected data instead of every query; no refetch on tab focus; `optimizePackageImports` for lucide-react, recharts, date-fns, framer-motion. For launch, run the production build (`next build` + `next start`) — development mode compiles each page on first open.
* **Visuals:** Analytics overview = delivery ring gauge + status breakdown bars + meter tiles; Executive Intelligence metric cards get status edge, sparkline and target progress bar.

### Round 5 follow-up (2026-11-22)
* New OpenAI key (project key) verified: accepted by OpenAI; `gpt-4.1` and `text-embedding-3-small` available.
* First real GPT-4.1 agent call reached OpenAI and was refused: **"429 You have no credits remaining"** — the OpenAI organisation has no API credit. Every AI feature will fail until credit is added at platform.openai.com → Settings → Billing.
* Provider 429s now surface as `provider_no_credit` ("The OpenAI account has no credit left…") or `provider_rate_limited`, across the app and in agent run history (test added; 37/37 AI and agent tests pass).

### Financial import mapping fix (2026-11-22)
* Cause: form-style spreadsheets (e.g. an expense report) have a title block above the table, so row 1 was taken as the header and columns became "Column A…"; the file also had no type/currency columns, so users reused a column and hit "Each source column can be mapped to only one destination field."
* The importer now finds the real header row (the row with clearly the most text headings, with data beneath; row 1 is kept otherwise).
* Each field can take "Same value for every row" (stored as `__fixed__:VALUE`), with suggestions for currency, transaction type, status and interval.
* A column may feed more than one field; the screen shows a warning instead of the server rejecting it.
* Tests: 43/43 import tests, including the expense-report layout and a row that normalises to a valid USD operating expense.
* Imports staged before this fix keep their old "Column A…" headers — re-upload the file.

### Financial import commit fix (2026-11-22)
* Cause: committing transaction rows returned "Internal server error" because Postgres refused to put JSONB text into the DATE column `transaction_date` (contracts and pipeline already cast their dates; transactions did not).
* Fix: the commit insert now uses `(r.normalized_data->>'transaction_date')::date`. A test checks the date and amount casts.
* Checked against the local database with a rolled-back dry run: both staged rows would insert (2026-06-30, USD 5,500 and USD 2,000).

### "Internal server error" on sign-in (2026-11-22)
* Cause: not the code. Docker Desktop's built-in Kubernetes cluster (`desktop-control-plane` + 3 workers) was using ~650% CPU, starving Postgres. Database connections took longer than the API's 5-second limit, so sign-in and dashboards failed with "Internal server error".
* The API now waits up to 15 s for a connection (`DATABASE_CONNECTION_TIMEOUT_MS`, default 15000).
* If the database still can't be reached, the API returns 503 "Lumorius is busy for a moment… try again in a few seconds" (with `Retry-After: 5`) instead of a 500. Only Postgres errors count; AI/integration network errors are unchanged. 5 tests added.
* Still to do (owner): turn off Docker Desktop Kubernetes (Settings → Kubernetes → untick Enable Kubernetes → Apply & restart) or pause its containers. It isn't used to run the app locally.
* 2026-11-22: Kubernetes paused at the owner's request. `desktop-control-plane` and `desktop-worker` are paused; `desktop-worker2`/`desktop-worker3` refused to freeze but dropped to 0% CPU once the control plane stopped. Database connections went from up to 9 s to ~25 ms; dashboard API calls now finish in under 0.7 s. Undo with `docker unpause desktop-control-plane desktop-worker`. Restarting Docker Desktop brings the whole cluster back.

### Executive Intelligence: sparklines + ECharts monthly analytics (2026-11-22)
* API (`executive-analytics.service.ts`): the dashboard now returns `trendWindow` and `monthlySeries` (per currency: monthly totals for every transaction type, record counts, month-end MRR). The window is at least the 12 months ending at the period end, the whole period when longer, capped at 36 (the PDF limit). Every financial KPI with data gets a monthly `trend`, including net revenue, gross profit, operating result, MRR and ARR. Derived trends appear only when their inputs exist. KPI values still use the selected period only. 5 new tests (48/48 pass).
* KPI cards: gradient-filled area sparklines (`components/ui/area-sparkline.tsx`, plain SVG with a smooth curve and hover readout), coloured by family (revenue indigo, recurring cyan, profit green, costs amber), plus a month-over-month chip where a rising cost counts as bad.
* Financials view: four headline KPI cards, then **Monthly revenue analytics** on Apache ECharts 5.6.0 (`revenue-analytics.tsx`). It has three views: Revenue & costs (money in above the line, money out below, net line), Profit & margin (gross profit / operating result bars with losses in red, gross margin % with an average line) and Recurring (MRR area with ARR in the tooltip). Also legend toggles, rich tooltips with month-over-month change, zoom/pan for ranges over 12 months, PNG download and a data-table view. Overview gains a "Financial pulse" row.
* Performance: ECharts loads only when the Financials view renders (`next/dynamic`, `ssr: false`), and only the bar/line charts and the components we use are registered (`components/charts/echarts-setup.ts`). Recharts was removed from this page.
* Verified: the API's monthly totals match the database exactly (Jun 2026 opex 7,500; Nov 2026 revenue 24,950, COGS 10,561.50, opex 2,030).

### Cash forecast, KPI sync, AI over financial records, agents, workflows (2026-11-22)
* **Cash forecast**: it only worked from a separate monthly cash-balance import, so it was empty. It now falls back to committed transactions: running net movement (money in minus money out) with downside/base/upside scenarios from the last 12 months' monthly movements, clearly labelled "From transactions — not a bank balance". It needs 3+ months of history with 2+ active months, and recent activity. Rebuilt on ECharts as a fan chart with monthly net bars and a "Today" marker. 2 tests.
* **KPI sync**: Analytics read a manual `kpi_metrics` table, while Executive Intelligence targets showed progress only when the selected dates exactly matched the target period. New `GET /executive-intelligence/scorecard` computes every target's actual over its own period (to date while running) with the dashboard engine. A shared `KpiScorecard` component is shown on Analytics ("Business KPIs") and in the Executive Intelligence KPI targets view, with one cache key, refreshed on imports/targets/live events. "Tracked KPIs" counts both.
* **AI over financial records**: new `FinancialDigestService` (12-month totals by type, margins, cost structure, month-by-month, largest cost lines grouped by description, customer concentration, MRR/ARR, pipeline, cash outlook, targets, data gaps). Unified retrieval adds it as a source for owners/admins when a question is about money. Record matching changed from all-words to any-word (ranked, description weighted above type), and documents are now found from indexed text even without extracted knowledge (same access rule as document search). The advisor prompt is now a CFO/operating-partner brief with a structure for improvement questions (where you stand → drivers → ranked recommendations with impact/effort/first steps → risks and gaps).
* **AI Advisor**: removed the embedded Agent Command Center, simplified the header (fixed light-mode colours), and added profit/cost starter questions.
* **Agents**: enabled the Profit & Finance Analyst (Growth, Trial, Professional; owners/admins only). Analysts and the Chief of Staff gather digest sections plus matching documents, meetings, decisions, tasks and transactions (keyword-only, so sources can be re-checked when a run finishes). Analysis results now include ranked recommendations (impact, effort, timeframe, expected impact, first steps, cited sources) and data gaps, rendered as cards with numbered citations. Verified: a real analyst run gathered 7 digest sections + 10 transactions; it then stopped with `provider_no_credit` (OpenAI has no credit).
* **Workflows**: creation and execution work. A test workflow ran, created its task and notification, and everything was then deleted. The earlier error matched the morning's database slowdown. Replaced the support/customer-onboarding/HR/sales templates with Lumorius ones (financial import review, profit improvement sprint, meeting action follow-up, approved decision execution, new document review, weekly business review) on real triggers. Removed the duplicated AI-missions panel (tabs are now Automations / Templates / Run history). The template button shows the real error, the editor gained a "Financial records committed" trigger, and default action titles no longer render as an empty "Follow up:".
