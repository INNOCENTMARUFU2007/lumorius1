# Account menu implementation plan
Goal: implement the approved account-menu-design.md without rebuilding auth or GDPR.
Architecture: keep existing profile fields and personal-deletion API; use a native modal dialog for confirmation. Preserve tenant references for an anonymized user and hand workflow ownership to an active company owner.
Tech stack: Next/React, Nest, PostgreSQL, Jest.

- [x] Add Google strategy regression tests: an existing active user receives the latest authorized HTTPS profile photo; missing photo preserves their image. Run Jest and observe the update case fail.
- [x] Add GDPR tests: a sole owner cannot request or complete deletion; another eligible owner permits deletion; personal purge never deletes organization/workflow records or clears user.organization_id. Run Jest and observe missing protections fail.
- [x] Update GoogleStrategy validate with a parameterized avatar_url update for existing users and return the updated profile.
- [x] Add a tenant-scoped ownership check under transaction locks before request and purge; preserve the anonymized user tenant reference; remove OAuth credentials and reassign owned workflows to an eligible company owner before deactivation.
- [x] Add account-actions.tsx: native dialog with initial focus, Escape/cancel, logout, separate typed-email personal deletion confirmation, scheduled-date receipt and visible request errors. Replace immediate header logout with this component and add broken-photo initials fallback.
- [x] Run focused GDPR/Google/JWT tests, API/web type checks and production builds using scratch output. Exercise rollback SQL fixture for user deletion preserving company/workflows and composite user references.
No company deletion endpoint is called by this UI. No real account will be deleted during testing. Preserve existing uncommitted work.
