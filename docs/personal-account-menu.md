# Personal account menu — 20 November 2026

Approved design: top-right authenticated name/profile photo; explicit logout confirmation; separate typed-email confirmation for personal deletion. Existing 30-day grace period retained.

## Implemented

- components/layout/header.tsx: authenticated name remains visible on small screens; saved profile photo displays with initials fallback if missing or broken.
- components/layout/account-actions.tsx: native modal dialog with Cancel, Log out, separate Delete my account flow, request errors and scheduled-date receipt. Pending requests disable actions. Security & Governance → Personal data provides cancellation during the grace period.
- auth/strategies/google.strategy.ts: refresh an existing user's authorized HTTPS Google photo. Select the actual identity column from a fixed allowlist of the two historical OAuth schemas. Profile-only authentication no longer writes new Google access/refresh secrets to the identity table.
- gdpr/gdpr.service.ts: reject sole-owner personal deletion and repeat ownership checks at purge time. Keep the anonymized inactive user's tenant reference to preserve composite financial references and historical attribution. Transfer workflow definitions owned by the departing user to an active, non-departing owner in the same company. Remove personal OAuth identities and sessions during purge. Company-deletion endpoints remain separate.
- Tests: google.strategy.spec.ts, personal-deletion.spec.ts and personal-deletion-postgres.smoke.cjs.

No database migration, real account deletion or company deletion was performed. Verification fixture runs only against a local development database and rolls its records back. Existing unrelated work preserved.

## Verification

Four focused GDPR, Google and JWT Jest suites passed (12 tests). API and web TypeScript checks passed. Final API and web production builds passed using scratch output. git diff --check passed.

The PostgreSQL acceptance fixture confirmed that the last owner cannot schedule personal deletion; a member can schedule and complete it; personal identity/credentials are removed; company, shared task, financial import references and a foreign tenant remain intact; owned workflow changes to an active owner; and that workflow executes successfully after the purge. Google profile refresh is tested against the actual OAuth schema with a fixture profile.

The attempted browser inspection timed out before a session was available. No visual or browser interaction test is claimed. Live Google authorization was not tested.

## Operational limits

An email/password registration cannot read a private email-provider profile photo from the address alone. Saved/authorized provider photos are used; otherwise initials display. Google provider credentials and the existing authorization flow must be configured for live profile access; this change does not introduce a new Google sign-in/session flow.

Workflow definitions and shared records remain company-owned. Work assigned specifically to a departed person still requires normal company reassignment. A failed ownership check preserves the account and reports the reason rather than deleting the workspace. The existing GDPR scheduler executes due requests after the grace period.
