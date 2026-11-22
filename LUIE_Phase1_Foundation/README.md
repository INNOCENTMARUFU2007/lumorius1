# Lumorius Unified Intelligence Engine (LUIE)
## Phase 1 — Durable Event Foundation v1

This package installs the first LUIE infrastructure milestone into the existing Lumorius NestJS API.

### Included

- `luie_domain_events`: tenant-scoped immutable event envelopes with event-key idempotency.
- `luie_event_deliveries`: independent delivery state per consumer, with retries, leases and dead-letter state.
- `LuieEventPublisher`: appends an event and consumer delivery rows using the caller's existing PostgreSQL `PoolClient` transaction.
- `LuieConsumerRegistry`: runtime registry for independently deployed event consumers.
- `LuieEventDeliveryService`: scheduled worker using `FOR UPDATE SKIP LOCKED`, worker leases, lease renewal, bounded exponential retry and dead-letter handling.
- A legacy-domain bridge that forwards durable task, project, meeting, decision and financial-import events to existing application listeners.
- Unit tests for publisher validation/idempotency, registry behaviour, successful delivery and retry scheduling.
- A guarded PowerShell 5.1 installer that registers `LuieModule` in `AppModule` without overwriting different pre-existing files.

### Installation

1. Extract the entire package to a temporary directory outside the Lumorius repository.
2. Open PowerShell in `C:\Users\HomePC\lumorius`.
3. Run:

```powershell
Unblock-File .\path\to\LUIE_Phase1_Foundation\Install-LUIE-Phase1.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\path\to\LUIE_Phase1_Foundation\Install-LUIE-Phase1.ps1" -ProjectRoot "C:\Users\HomePC\lumorius" -WhatIf
```

4. Review the preflight output. Then run again without `-WhatIf`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\path\to\LUIE_Phase1_Foundation\Install-LUIE-Phase1.ps1" -ProjectRoot "C:\Users\HomePC\lumorius"
```

The installer refuses to overwrite any different existing LUIE file. It backs up `apps/api/src/app.module.ts` before changing it. It does not modify `package.json`, run database migrations, or remove existing files.

### Validate the API

From the repository root:

```powershell
pnpm --filter @lumorius/api build
pnpm --filter @lumorius/api test -- --runInBand
```

The focused tests are:

```powershell
pnpm --filter api test -- --runInBand src/luie/luie-event.publisher.spec.ts src/luie/luie-consumer.registry.spec.ts src/luie/luie-event-delivery.service.spec.ts
```

Use the existing test script conventions in the repository if the package's Jest configuration expects a different path format.

### Database migration

The migration is staged at:

`apps/api/src/database/migrations/20261108_luie_event_foundation_v1.sql`

The repository migration runner also has the deployable copy at `database/schema/012_luie_event_foundation_v1.sql`. The meeting-recording cleanup extension is staged at `apps/api/src/database/migrations/20261113_luie_meeting_storage_cleanup_v1.sql` and `database/schema/013_luie_meeting_storage_cleanup_v1.sql`. These migrations are **not executed by the installer**. Review them and apply them through the existing Lumorius migration process (for example, `./scripts/migrate.sh up`) after taking the usual database backup. Both migrations are wrapped in transactions.

### Event publishing contract

The source record mutation and its event must commit or roll back together. The publisher therefore requires the transaction client:

```typescript
await this.db.transaction(async (client) => {
  const result = await client.query<{ id: string }>(
    `INSERT INTO tasks (organization_id, title, created_by_id)
     VALUES ($1::uuid, $2, $3::uuid)
     RETURNING id`,
    [organizationId, title, actor.userId],
  );

  const taskId = result.rows[0].id;
  await this.luieEventPublisher.append(
    client,
    {
      organizationId,
      eventKey: `task.created:${taskId}:1`,
      eventType: 'task.created',
      aggregateType: 'task',
      aggregateId: taskId,
      actorId: actor.userId,
      sourceVersion: 1,
      schemaVersion: 1,
      payload: { title },
    },
    ['luie.search'],
  );
});
```

The example illustrates the transaction contract; it is not automatically inserted into `TasksService` by this foundation installer. Producer integration is a separate controlled patch so each affected module can be converted safely using its current exact source.

### Registering a consumer

A consumer must implement `LuieEventConsumer` and register itself with `LuieConsumerRegistry` during module initialisation. Its `name` must exactly match the consumer name supplied to `LuieEventPublisher.append()`.

Consumer handlers must be idempotent. Delivery is **at least once**, not exactly once. If a handler performs an external side effect, it should use the event ID or event key as its idempotency key wherever the downstream provider supports it.

The delivery worker only claims deliveries for consumer names currently registered in the process. Until a consumer is registered, its delivery remains pending; it is not silently marked complete. The current integration publishes durable events for task and project lifecycle changes, meeting completion/deletion, approved decisions, financial imports, and document processing. Registered bridge/knowledge/workflow consumers forward them to the existing application listeners; this does not replace those domain services or make delivery exactly once.

### Operational behaviour

- Poll interval: 10 seconds.
- Claim batch size: 10 deliveries.
- Lease: 120 seconds, renewed during handler execution.
- Maximum attempts: 8.
- Retry delay: exponential from 5 seconds, capped at 15 minutes.
- Final failure: `dead_letter` with a bounded error message.
- Competing workers: PostgreSQL row locks with `SKIP LOCKED`.
- Each consumer has independent delivery state.

### Important boundaries

1. Do not publish sensitive document content, transcripts, access tokens, API keys or full financial records in event payloads. Payloads are limited to 64 KB and intended for identifiers and minimal metadata.
2. `actor_id` and `team_id` are historical opaque references. A consumer must revalidate current tenant/team access before retrieving source data.
3. Event creation belongs in the same transaction as the source mutation. Publishing after commit recreates the event-loss window this design is meant to eliminate.
4. The current milestone establishes durable delivery and connects the current Phase 1 sources. Later unified retrieval and AI-orchestration roadmap work remains separate and is not included in this foundation.
5. No event-sourced rewrite, replacement knowledge graph, copied financial ledger or duplicate meeting intelligence engine is introduced.
