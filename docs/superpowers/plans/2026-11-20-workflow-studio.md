# Connected Workflow Studio implementation plan
Goal: connect existing business playbooks, persisted AI missions and execution results in /workflows without a second engine.
Architecture: retain AgentCommandCenter rendering with mission/results modes and guided drafts. Show role-filtered automation history through existing APIs. URL state restores selected view/run. Tasks and Decisions remain authoritative.
- [ ] Add Node regression tests for URL restoration, mission context, honest status labels and safe task links; observe failure.
- [ ] Implement studio-state.ts pure contracts.
- [ ] Extend AgentCommandCenter with guided drafts, mode props, scoped queries, shareable selected run, output download and explicit execution states. Preserve approvals and evidence.
- [ ] Connect business playbooks to the mission composer and display workflow draft receipts.
- [ ] Add Automations, AI Missions and Results to Workflows, showing actual task links and recorded execution output.
- [ ] Run contract tests, existing API persistence/approval/tenant fixture, type checks and production build. Document live provider/browser limits.
