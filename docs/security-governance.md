# Security and governance operations

## Application controls

- Organization-scoped requests use the user's current database role and organization, not stale JWT claims. Protected services must continue to include the authenticated organization ID in tenant-owned queries.
- Owners and admins manage organization API keys, audit access, and retention. Only owners can schedule organization deletion. Admins can review or cancel a pending request. API-key plaintext appears once during creation. Public API list scopes cover organization-shared documents, tasks, and projects. Tasks inherit project team restrictions.
- Access review in Security & Governance lists current workspace roles, enrollment in MFA, live sessions, active API keys, and aggregate AI usage. Filter or page through audit events. The audit view omits before/after values and redacts credential fields.
- Sign-ins, session revocations, API-key lifecycle actions, member changes, integration changes, exports, deletion requests, and retention-policy changes are audited. Audit-write failures fail the associated security-sensitive operation.
- Account and organization deletion have a 30-day grace period. Account cleanup revokes sessions and keys, removes private chats and briefing preferences, and anonymizes the account while preserving shared business records. Organization deletion queues document and recording removal through the existing retryable storage cleanup outbox before deleting live records.
- The requester can check the organization deletion receipt at `GET /api/v1/gdpr/organization/deletion-requests/:id`, including pending and retrying storage object counts. Review a failed request in the application and inspect backend logs before retrying. A completed live purge still has separate backup and storage lifecycles.
- Account export is available at `GET /api/v1/gdpr/export`. Owners and administrators can export supported organization datasets at `GET /api/v1/gdpr/organization/export?resource=tasks`. Continue with `after=<nextCursor>` until the cursor is null. The organization export includes structured records and document/meeting metadata. Download files through their authorized source endpoints.
- Retention can be configured for audit logs and meeting transcript text. Transcript retention clears the legacy transcript field and transcript rows. Meeting summaries and generated decisions have separate lifecycles.
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

Apply `013_luie_meeting_storage_cleanup_v1.sql`, `024_enterprise_security_governance.sql`, and `026_unified_workspace.sql` after the existing application schema and before deploying the updated API. Confirm the deletion queue contents when enabling the scheduler on an existing installation. Verify private-team and two-organization access, audited exports, scheduled delivery, and object cleanup using isolated fixtures before production rollout.

Review dependency advisories for the pinned lockfile in CI and before releases. Keep credentials in the deployment secret store, rotate exposed keys, and review access to backups. SSO and provisioning require a validated identity integration and remain outside the current deployment.

## Chief of Staff

The workspace assembles a role-scoped daily or weekly view when opened. The schedule sends a private in-app link at the configured UTC time. Current permissions are checked when the link is opened. Alerts use task and project dates, decision deadlines, objective status, measured KPI changes, and active contracts. Critical alerts stay visible while actionable.

Members can request an active manual workflow. A different manager, administrator, or owner can approve and enqueue it. Reviews and resulting runs retain their own audit events. Owners and administrators can inspect run payloads and error details. Other members see execution status and step progress. Financial suggestions and decision approvals link to the original evidence and existing review controls.
