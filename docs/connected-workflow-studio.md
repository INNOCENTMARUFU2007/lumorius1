# Connected Workflow Studio
The existing /workflows page has Automations, AI Missions and Results sections. Business playbooks prefill the existing agent composer directly; users add context, choose an entitled agent and run a mission. Submission opens Results and writes the run ID into the URL. The existing persisted agent API, queue and Decisions approval/application flow are reused.

Results → AI outputs shows personal run history, saved summaries, evidence, proposed goals/tasks, execution timeline, errors, token/cost records and approval receipts. Download result exports the currently permitted artifact as JSON. Analysis ready means a recommendation exists; Approved changes applied means the existing application flow completed.

Results → Automation outputs lets users choose a workflow and inspect its latest 50 recorded runs and steps. Completed task actions link to the actual Tasks record. Failed or running actions no longer display Action completed. Manual execution selects automation results automatically.

The shared AgentCommandCenter renderer powers both the studio and the existing AI workspace. Agent queries include user/organization cache scope. Backend tenant, role, entitlement and evidence checks remain authoritative. No migration or duplicate engine was introduced.

How to demonstrate:
1. Open /workflows → AI Missions.
2. Choose Draft with AI on a business playbook, add company-specific context and run.
3. Read Results → AI outputs. Select saved runs to reopen their output.
4. Goal proposals use Submit to Decisions, approval and Apply approved proposal. The receipt opens created objectives/tasks.
5. Open Automations, review/activate a draft, then run it. Results → Automation outputs shows step status and task links.

Verification: four Node tests cover URL restoration/invalid IDs, safe task links, step-status honesty and distinction between analysis/application. Web TypeScript and production builds were executed. The PostgreSQL agent acceptance rerun was blocked by ECONNREFUSED; no fresh database end-to-end pass is claimed. No live model quality, live external-send or browser visual verification is claimed.

Support/HR/onboarding/sales templates remain coordination workflows and AI planning missions. They do not imply autonomous external ticket delivery, access provisioning or HR decisions. AI providers and permitted source data must be configured for live output. Existing workflow history permissions restrict detailed outputs for some roles.
