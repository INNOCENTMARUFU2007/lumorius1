import { costLine, isFinanceQuestion } from './financial-digest.service';
import { agentPrompt } from '../agents/agent-runs.service';

describe('financial digest helpers', () => {
  it('recognises money questions', () => {
    expect(isFinanceQuestion('What can we do to improve profit?')).toBe(true);
    expect(isFinanceQuestion('How do we cut hotel costs?')).toBe(true);
    expect(isFinanceQuestion('Which meetings happened last week?')).toBe(false);
  });

  it('groups transaction descriptions into cost lines', () => {
    expect(costLine('Hotel - business meeting in Dubai - A Person')).toBe('Hotel');
    expect(costLine('Inventory purchase, raw materials')).toBe('Inventory purchase');
    expect(costLine('')).toBe('(no description)');
  });

  it('asks the profit analyst for quantified, cited recommendations', () => {
    const prompt = agentPrompt('financial-analyst', 'analysis');
    expect(prompt).toContain('CFO-grade');
    expect(prompt).toContain('"recommendations"');
    expect(prompt).toContain('untrusted');
    expect(agentPrompt('chief-of-staff', 'goals')).toContain('"goals"');
  });
});
