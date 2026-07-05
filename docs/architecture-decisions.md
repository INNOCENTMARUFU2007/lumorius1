# Architecture Decision Records — Lumorius

## ADR-001: Monorepo with Turborepo

**Date**: 2025-01-01  
**Status**: Accepted

### Context
Lumorius consists of a NestJS API, a Next.js web app, and an Expo mobile app sharing types.

### Decision
Use Turborepo with pnpm workspaces. Shared types live in `packages/types`.

### Consequences
- Single CI pipeline, shared lint/TypeScript config.
- `packages/types` must be built before consumer apps.

---

## ADR-002: pgvector for Embeddings

**Date**: 2025-01-01  
**Status**: Accepted

### Context
Company Brain (RAG) and Knowledge Graph require vector similarity search.

### Decision
Use PostgreSQL + `pgvector` extension instead of a separate vector database (Pinecone, Qdrant). This reduces operational complexity since PostgreSQL is already required.

### Consequences
- All search is `cosine_distance` queries on `vector(1536)` columns.
- Embedding dimension is fixed at 1536 (OpenAI `text-embedding-3-small`).
- For 10M+ chunks, consider adding HNSW indexes or migrating to a dedicated vector DB.

---

## ADR-003: BullMQ for Background Processing

**Date**: 2025-01-01  
**Status**: Accepted

### Context
Document processing (chunking, embedding) and meeting transcription (Whisper) are slow operations that must not block HTTP responses.

### Decision
Use `@nestjs/bull` (BullMQ) backed by Redis. Two named queues: `documents` and `meetings`.

### Consequences
- Workers can be scaled independently by running additional API instances with `WORKER_ONLY=true`.
- Redis is a required dependency.

---

## ADR-004: Multi-model AI Strategy

**Date**: 2025-01-01  
**Status**: Accepted

### Context
Different tasks benefit from different models. OpenAI is best for general reasoning; Claude for long-context analysis; Gemini for multimodal.

### Decision
`AiService` is model-agnostic. The caller specifies `model` in the request body (`gpt-4o` | `claude-3-5-sonnet` | `gemini-pro`). Default is `gpt-4o`.

### Consequences
- Multiple API keys must be configured for full functionality.
- Only `OPENAI_API_KEY` is strictly required; Anthropic and Gemini are optional.

---

## ADR-005: Stripe for Billing

**Date**: 2025-01-01  
**Status**: Accepted

### Context
Lumorius needs subscription management with usage-based limits per plan tier.

### Decision
Use Stripe Subscriptions with Customer Portal. Webhook events update the `subscriptions` table. Plan limits enforced server-side via `BillingService.checkLimit()`.

### Consequences
- `STRIPE_WEBHOOK_SECRET` must be configured before billing works.
- Webhook endpoint: `POST /api/v1/billing/webhook`.

---

## ADR-006: JWT with Refresh Token Rotation

**Date**: 2025-01-01  
**Status**: Accepted

### Context
Short-lived JWTs (15m) improve security but would require frequent logins without refresh tokens.

### Decision
Issue 15m access tokens + 7d refresh tokens. Refresh tokens stored hashed in the `sessions` table. On refresh, old token is revoked and a new pair is issued (rotation).

### Consequences
- Token theft window is limited to 15 minutes.
- Mobile app must store refresh token in SecureStore.
- Web app stores tokens in httpOnly cookies.
