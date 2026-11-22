import { BUSINESS_TEMPLATES, workflowTemplate } from './business-templates';

const SUPPORTED = new Set([
  'manual', 'financial.import_committed', 'meeting.completed', 'decision.approved', 'document.indexed', 'schedule.weekly',
]);

describe('Lumorius workflow templates', () => {
  it.each(BUSINESS_TEMPLATES)('$id uses a supported trigger and only internal, reviewable task actions', (template) => {
    const draft = workflowTemplate(template.id)!;
    expect(SUPPORTED.has(draft.triggerType)).toBe(true);
    expect(draft.steps.length).toBeGreaterThan(0);
    expect(draft.steps.every((step) => step.type === 'task.create')).toBe(true);
    expect(draft.steps.some((step) => /review|approv|confirm/i.test(step.config.title))).toBe(true);
  });

  it('offers no customer onboarding, HR or support templates', () => {
    const names = BUSINESS_TEMPLATES.map((template) => template.name.toLowerCase()).join(' ');
    expect(names).not.toMatch(/onboarding|hr |human resources|support triage/);
  });

  it('rejects arbitrary templates', () => expect(workflowTemplate('https://example.com')).toBeNull());
});
