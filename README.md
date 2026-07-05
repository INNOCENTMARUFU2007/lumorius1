# Lumorius — AI Operating System for Modern Businesses

> Built by **INMARTECH PVT LTD**

Lumorius is a production-ready AI SaaS platform covering 10 integrated modules: Company Brain (RAG), Meeting Intelligence, Knowledge Graph, Founder OS Analytics, Workflow Automation, AI Strategy Advisor, and more — all in a single deployable monorepo.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Quick Start (Docker)](#quick-start-docker)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Module Overview](#module-overview)
- [API Documentation](#api-documentation)
- [Database](#database)
- [Deployment](#deployment)

---

## Features

| Module | Description |
|---|---|
| **Auth** | JWT + MFA (TOTP) + OAuth (Google/GitHub/Microsoft) + Magic Links |
| **Org Management** | Multi-tenant teams, departments, roles, invitations |
| **Company Brain** | RAG pipeline — upload docs → vector search → AI answers |
| **Founder OS** | KPI dashboard, OKR tracking, business health scoring |
| **Meeting Intelligence** | Whisper transcription, AI summaries, action items |
| **Knowledge Graph** | pgvector semantic search across all org knowledge |
| **Business Analytics** | Revenue, growth metrics, AI-generated insights |
| **Workflow Automation** | BullMQ-powered trigger→action pipelines |
| **AI Strategy Advisor** | Multi-model chat (GPT-4o / Claude / Gemini) |
| **Billing** | Stripe subscriptions with usage-based limits |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15, React 19, Tailwind CSS, shadcn/ui, React Query |
| **Backend** | NestJS 11, Express 5, TypeScript 5 |
| **Database** | PostgreSQL 16 + pgvector, Drizzle ORM |
| **Cache / Queue** | Redis 7, BullMQ |
| **AI** | OpenAI (GPT-4o, Whisper, embeddings), Anthropic Claude, Google Gemini |
| **Storage** | AWS S3 (or any S3-compatible endpoint) |
| **Email** | Nodemailer (SMTP) |
| **Auth** | Passport.js, JWT, TOTP (speakeasy), bcrypt |
| **Infra** | Docker Compose, Nginx |
| **Monorepo** | Turborepo + pnpm workspaces |
| **Mobile** | Expo (React Native) |

---

## Architecture

```
lumorius/
├── apps/
│   ├── api/          # NestJS backend  → :3001 (proxied via /api/v1)
│   ├── web/          # Next.js frontend → :3000
│   └── mobile/       # Expo React Native app
├── packages/
│   └── types/        # Shared TypeScript types
├── database/
│   ├── schema/       # Raw SQL migrations
│   └── seeds/        # Seed data (billing plans, etc.)
├── infra/
│   ├── docker/       # docker-compose.yml
│   └── nginx/        # nginx.conf (reverse proxy)
└── docs/             # ADRs and architecture notes
```

Nginx routes:
- `/` → Next.js frontend
- `/api/` → NestJS backend
- `/api/docs` → Swagger UI

---

## Quick Start (Docker)

### Prerequisites
- Docker ≥ 24 + Docker Compose v2
- An OpenAI API key (minimum requirement for core AI features)

### 1. Clone and configure

```bash
git clone <https://github.com/INNOCENTMARUFU2007/Lumorius1.git> lumorius
cd lumorius
cp .env.example .env
# Edit .env — fill in all required values (see Environment Variables below)
```

### 2. Start all services

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

This starts:
- `postgres` (with pgvector) on port 5432
- `redis` on port 6379
- `opensearch` on port 9200
- `api` (NestJS) on port 3001
- `web` (Next.js) on port 3000
- `nginx` on port 80 (public entry point)

### 3. Run database migrations

```bash
docker exec -i lumorius-postgres psql -U lumorius -d lumorius_db < database/schema/001_create_all_tables.sql
docker exec -i lumorius-postgres psql -U lumorius -d lumorius_db < database/seeds/001_billing_plans.sql
```

### 4. Open the app

Navigate to **http://localhost** — the Nginx proxy will serve everything.

---

## Local Development

### Prerequisites
- Node.js ≥ 20
- pnpm ≥ 9 (`npm i -g pnpm`)
- PostgreSQL 16 with pgvector extension
- Redis 7

### Install dependencies

```bash
pnpm install
```

### Run the API (backend)

```bash
pnpm --filter @lumorius/api dev
# Running on http://localhost:3001
```

### Run the web app (frontend)

```bash
pnpm --filter @lumorius/web dev
# Running on http://localhost:3000
```

### Run mobile (Expo)

```bash
pnpm --filter @lumorius/mobile start
```

### Run everything at once (Turborepo)

```bash
pnpm dev
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values.

### Required (core functionality)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | 64+ char random secret |
| `JWT_REFRESH_SECRET` | 64+ char random secret (different from above) |
| `OPENAI_API_KEY` | OpenAI key for embeddings + GPT-4o |

### Required (email / auth flows)

| Variable | Description |
|---|---|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | Usually 587 (TLS) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `EMAIL_FROM` | From address for magic-link emails |

### Required (billing)

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |

### Required (file uploads)

| Variable | Description |
|---|---|
| `S3_ENDPOINT` | S3 endpoint URL |
| `S3_BUCKET` | Bucket name |
| `S3_ACCESS_KEY` | AWS / S3-compatible access key |
| `S3_SECRET_KEY` | AWS / S3-compatible secret key |

### Optional

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude 3.5 Sonnet |
| `GEMINI_API_KEY` | Google Gemini |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth |
| `GITHUB_CLIENT_ID/SECRET` | GitHub OAuth |
| `SENTRY_DSN` | Error monitoring |

---

## Module Overview

### Auth (`/api/v1/auth`)

```
POST /auth/register          Create account
POST /auth/login             Email + password login (returns JWT pair)
POST /auth/refresh           Refresh access token
POST /auth/logout            Revoke refresh token
POST /auth/magic-link        Request passwordless login link
GET  /auth/google            Google OAuth redirect
GET  /auth/github            GitHub OAuth redirect
POST /auth/mfa/enable        Enable TOTP MFA
POST /auth/mfa/verify        Verify TOTP code
```

### Company Brain (`/api/v1/documents`)

```
POST /documents              Upload document (PDF, DOCX, TXT, MD)
GET  /documents              List org documents
POST /documents/search       Semantic search (pgvector)
POST /documents/:id/chat     RAG chat with document context
```

### Meetings (`/api/v1/meetings`)

```
POST /meetings               Create meeting
POST /meetings/:id/upload    Upload recording (Whisper transcription)
GET  /meetings/:id/summary   AI-generated summary + action items
GET  /meetings/:id/insights  Sentiment, decisions, risks
```

### Knowledge Graph (`/api/v1/knowledge`)

```
GET  /knowledge/nodes        List nodes
POST /knowledge/nodes        Create node
POST /knowledge/search       Semantic search across all knowledge
GET  /knowledge/graph        Full graph structure
```

### AI Advisor (`/api/v1/ai`)

```
POST /ai/chat                Multi-model chat (GPT-4o / Claude / Gemini)
POST /ai/analyze             Business analysis with context
GET  /ai/conversations       Conversation history
```

### Analytics (`/api/v1/analytics`)

```
GET /analytics/dashboard     Founder OS KPI dashboard
GET /analytics/revenue       Revenue metrics
GET /analytics/health-score  Business health score
```

### Billing (`/api/v1/billing`)

```
GET  /billing/plans          Available plans
GET  /billing/subscription   Current subscription
POST /billing/checkout       Create Stripe checkout session
POST /billing/portal         Customer portal session
POST /billing/webhook        Stripe webhook handler
```

---

## API Documentation

Swagger UI is available at `/api/docs` when the API server is running.

---

## Database

The full schema is in `database/schema/001_create_all_tables.sql`.

### Key tables

| Table | Purpose |
|---|---|
| `users` | User accounts |
| `organizations` | Multi-tenant orgs |
| `org_members` | Role-based membership |
| `documents` | Company Brain docs |
| `document_chunks` | Vector-embedded chunks (pgvector) |
| `meetings` | Meeting records |
| `meeting_transcripts` | Whisper transcriptions |
| `knowledge_nodes` | Knowledge graph nodes |
| `knowledge_edges` | Graph relationships |
| `tasks` | Task management |
| `projects` | Project grouping |
| `workflows` | Automation pipelines |
| `workflow_steps` | Individual steps |
| `analytics_events` | Event tracking |
| `ai_conversations` | Chat history |
| `billing_plans` | Plan catalog |
| `subscriptions` | Org subscriptions |
| `sessions` | JWT refresh tokens |

### Running migrations manually

```bash
psql $DATABASE_URL < database/schema/001_create_all_tables.sql
psql $DATABASE_URL < database/seeds/001_billing_plans.sql
```

---

## Deployment

### Production with Docker Compose

```bash
# Build and start
docker compose -f infra/docker/docker-compose.yml up -d --build

# View logs
docker compose -f infra/docker/docker-compose.yml logs -f api
docker compose -f infra/docker/docker-compose.yml logs -f web
```

### SSL / HTTPS

Replace the Nginx config at `infra/nginx/nginx.conf` with your SSL-enabled version, or put a load balancer (AWS ALB, Cloudflare, Caddy) in front.

### Scaling

- **API**: stateless — run multiple replicas behind a load balancer
- **Web**: Next.js supports horizontal scaling natively  
- **Workers**: BullMQ processors can run as separate containers (set `WORKER_ONLY=true`)
- **Database**: add read replicas via `DATABASE_REPLICA_URL`

---

## License

Proprietary — © 2025 INMARTECH PVT LTD. All rights reserved.
#   l u m o r i u s 1 
 
 