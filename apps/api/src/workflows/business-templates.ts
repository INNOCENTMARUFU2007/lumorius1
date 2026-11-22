/**
 * Ready-made workflows built around Lumorius modules. Each is created as a draft with
 * internal task actions only; a manager reviews and activates it.
 */
export const BUSINESS_TEMPLATES = [
  {
    id: 'financial-review',
    name: 'Financial import review',
    trigger: 'financial.import_committed',
    description: 'When financial records are committed in Executive Intelligence, review them, update KPI targets and brief leadership.',
    tasks: [
      'Review newly committed financial records for anomalies',
      'Update KPI targets and cost lines in Executive Intelligence',
      'Share a profit and cash summary with leadership for review',
    ],
  },
  {
    id: 'profit-improvement',
    name: 'Profit improvement sprint',
    trigger: 'manual',
    description: 'A two-week sprint to act on the largest cost lines and margin gaps, starting from an AI profit analysis.',
    tasks: [
      'Run the Profit & Finance Analyst and review its recommendations',
      'Assign owners to the top three savings or revenue actions',
      'Review margin and cost results against target after two weeks',
    ],
  },
  {
    id: 'meeting-actions',
    name: 'Meeting action follow-up',
    trigger: 'meeting.completed',
    description: 'After a meeting is processed, confirm owners and due dates for its action items.',
    tasks: [
      'Review action items and owners from the meeting summary',
      'Set due dates for agreed commitments',
      'Check open commitments before the next meeting',
    ],
  },
  {
    id: 'decision-execution',
    name: 'Approved decision execution',
    trigger: 'decision.approved',
    description: 'Turn an approved decision into owned work and schedule its outcome review.',
    tasks: [
      'Break the approved decision into implementation tasks',
      'Confirm the owner and success measure',
      'Schedule the outcome review',
    ],
  },
  {
    id: 'document-review',
    name: 'New document review',
    trigger: 'document.indexed',
    description: 'When a document is indexed into Company Brain, verify its key facts and link it to related work.',
    tasks: [
      'Review the key facts and figures in the new document',
      'Link the document to related projects, decisions or tasks',
    ],
  },
  {
    id: 'weekly-review',
    name: 'Weekly business review',
    trigger: 'schedule.weekly',
    description: 'Every Monday, review KPI targets, overdue work and decisions waiting for approval.',
    tasks: [
      "Review KPI targets and last week's financial movement",
      'Clear or reassign overdue tasks',
      'Move pending decisions to approval',
    ],
  },
] as const;

export function workflowTemplate(id: string) {
  const template = BUSINESS_TEMPLATES.find((item) => item.id === id);
  return template ? {
    name: template.name,
    description: template.description,
    triggerType: template.trigger as string,
    triggerConfig: {},
    steps: template.tasks.map((title) => ({ type: 'task.create', config: { title, priority: 'medium' } })),
  } : null;
}
