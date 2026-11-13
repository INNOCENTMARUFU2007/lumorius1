# Security and governance operations

## Application controls

- Organization-scoped requests use the user's current database role and organization, not stale JWT claims. Protected services must continue to include the authenticated organization ID in tenant-owned queries.
- Owners and admins can manage organization API keys, security audit records, deletion requests, and retention policies. API-key plaintext is returned only during creation; stored key hashes and credential material are not included in audit results.
- Sign-ins, session revocations, API-key lifecycle actions, member changes, integration changes, exports, deletion requests, and retention-policy changes are audited. Audit-write failures fail the associated security-sensitive operation.
- Account and organization deletion use a 30-day grace period. Deletion status and per-request failures are retained for review. Retention policies can be configured for audit logs and meeting transcripts.
- A global request-throttling guard enforces the configured short, medium, and long limits. Login, credential recovery, API-key changes, and invitations have tighter route limits. The built-in throttler is process-local; multi-instance deployments should also enforce a shared edge/WAF or distributed rate limit.

## Database row-level security deployment gate

PostgreSQL RLS is not enabled by this change. The API and background workers currently share database access, while scheduled jobs and queue consumers process multiple organizations. Enabling tenant policies before those entry points establish a verified tenant context could either break processing or encourage unsafe policies that allow access when context is missing.

Before enabling RLS:

1. Establish transaction-local organization and actor context for every authenticated request, API-key request, queue job, and scheduled job.
2. Separate migration, API, and worker database roles; ensure runtime roles do not own protected tables or have `BYPASSRLS`.
3. Add fail-closed policies to every tenant-owned table and verify foreign-key and background-job behavior.
4. Run PostgreSQL integration tests with at least two organizations, including read, write, export, deletion, and worker cases, before applying the migration to production.

The existing application-level organization predicates and fresh membership checks are defense-in-depth, not a substitute for database RLS. Do not mark the RLS requirement complete until the deployment gate above is satisfied.

## Backup and incident handling

- Backups must be encrypted, access-restricted, monitored, and retained according to the organization's approved retention schedule. Test restores periodically.
- Deletion from the live database does not immediately erase immutable backups. Document the backup expiry window and ensure deleted data expires from backups under that policy.
- For a suspected compromise, revoke affected sessions and API keys, disconnect affected integrations, preserve relevant audit records, assess impacted organizations and data, and follow the organization's legal and customer-notification procedures.
- Record incident timelines, containment actions, affected systems, and recovery verification without copying credentials or sensitive customer content into the incident log.

## Deployment

Apply the enterprise governance migration through the normal reviewed migration process, then verify deletion status, retention policy, and audit endpoints against a disposable PostgreSQL database before production rollout. No live database migration or customer-data deletion was performed as part of this code change.
