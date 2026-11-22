# Tenant entitlements and governed automation implementation plan
Approved by user: Starter Chief of Staff/Integration Engineer; Growth adds Operations Manager and advanced financial intelligence; Professional all five agents and all implemented features. Business Twin and advanced governance require Professional. Basic security and approval enforcement remain available on all tiers.
Architecture: one entitlement policy resolved from authenticated organization subscriptions. Check backend requests, queued agent work and proposal application. Preserve existing LUIE, workflow execution, import data and authorization. Remove standalone marketing presentation; retain source records and campaign analytics.
1. Add regression tests for tier boundaries, inactive subscriptions and cross-tenant entitlement resolution; observe failure.
2. Implement policy, scoped subscription resolution, upgrade API and guards for paid features. Keep role checks independent.
3. Align agent catalog, dispatch and approval with policy. Add Upgrade links and feature gates in existing layouts. Billing lists must match policy.
4. Remove marketing page/navigation, preserving data.
5. Add reviewable support/onboarding/HR/sales workflow templates through existing create/activate APIs. AI missions draft plans; no external sends or HR decisions.
6. Scope refresh lifetime to authenticated tenant/user; audit change feed and worker authorization.
7. Run focused tests, PostgreSQL rollback fixture, type checks and builds. Document limitations without declaring whole-app isolation proven.
