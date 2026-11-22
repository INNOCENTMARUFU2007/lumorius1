import { BadRequestException } from '@nestjs/common';

export const AGENTS = [
  { id: 'chief-of-staff', label: 'Executive Chief of Staff', purpose: 'Briefings and proposed OKRs from permitted workspace records.' },
  { id: 'integration-engineer', label: 'AI Integration Engineer', purpose: 'Connector availability, scopes and setup diagnostics.' },
  { id: 'financial-analyst', label: 'AI Profit & Finance Analyst', purpose: 'Profit, cost and revenue analysis across financial records, documents, meetings and operations, with ranked recommendations.' },
  { id: 'operations-manager', label: 'AI Operations Manager', purpose: 'Workflow performance and operational bottlenecks.' },
  { id: 'sales-development', label: 'AI Sales Development Agent', purpose: 'CRM-backed qualification and follow-up drafts for review.' },
] as const;
export type Agent = typeof AGENTS[number]['id'];
export type Intent = 'briefing' | 'goals' | 'analysis' | 'marketing';
export type Evidence = { key: string; title: string; href: string; detail: string };
export type Goal = { title: string; rationale: string; dueDate: string; target: number; baseline: number | null; unit: string; metric: string; evidenceKeys: string[]; tasks: string[] };
export type Level = 'low' | 'medium' | 'high';
export type Recommendation = {
  title: string; rationale: string; expectedImpact: string; impact: Level; effort: Level;
  timeframe: string; firstSteps: string[]; evidenceKeys: string[];
};
export type Artifact = { summary: string; evidence: Evidence[]; goals: Goal[]; recommendations?: Recommendation[]; dataGaps?: string[] };

const level = (value: unknown): Level => (value === 'low' || value === 'medium' || value === 'high' ? value : 'medium');
const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '');

/**
 * Optional ranked recommendations. Malformed items are skipped rather than failing the
 * run, and citations are limited to evidence the agent was actually given.
 */
export function parseRecommendations(value: unknown, evidence: Evidence[]): Recommendation[] {
  if (!Array.isArray(value)) return [];
  const keys = new Set(evidence.map((item) => item.key));
  return value.slice(0, 8).flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    const title = text(item.title, 160);
    const rationale = text(item.rationale, 900);
    if (!title || !rationale) return [];
    return [{
      title, rationale,
      expectedImpact: text(item.expectedImpact, 300) || 'Not estimated',
      impact: level(item.impact), effort: level(item.effort),
      timeframe: text(item.timeframe, 60) || 'Not set',
      firstSteps: (Array.isArray(item.firstSteps) ? item.firstSteps : []).map((step) => text(step, 200)).filter(Boolean).slice(0, 4),
      evidenceKeys: [...new Set((Array.isArray(item.evidenceKeys) ? item.evidenceKeys : []).filter((key): key is string => typeof key === 'string' && keys.has(key)))].slice(0, 6),
    }];
  });
}

function parseGaps(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).map((gap) => text(gap, 240)).filter(Boolean).slice(0, 8);
}

const reject = () => new BadRequestException('The agent returned an invalid result. Refine the request and try again.');
function bounded(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw reject();
  return value.trim();
}
function values(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw reject();
  return value;
}
const object = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw reject();
  return value as Record<string, unknown>;
};
export function parseArtifact(text: string, evidence: Evidence[], intent: Intent, today = new Date().toISOString().slice(0, 10)): Artifact {
  let result: Record<string, unknown>;
  try { result = object(JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))); } catch { throw reject(); }
  const summary = bounded(result.summary, 6000);
  if (intent !== 'goals') {
    return { summary, evidence, goals: [], recommendations: parseRecommendations(result.recommendations, evidence), dataGaps: parseGaps(result.dataGaps) };
  }
  const keys = new Set(evidence.map(item => item.key));
  const goals = values(result.goals, 5).map(value => {
    const item = object(value);
    const dueDate = bounded(item.dueDate, 10);
    const date = new Date(dueDate + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dueDate || dueDate < today || date.getUTCFullYear() > 2050) throw reject();
    const citations = values(item.evidenceKeys, 6).map(key => bounded(key, 110));
    if (citations.some(key => !keys.has(key))) throw reject();
    if (typeof item.target !== 'number' || !Number.isFinite(item.target) || item.target < 0 || item.target > 9999999999.99 || Math.round(item.target*100)/100 !== item.target) throw reject();
    return {
      title: bounded(item.title, 120), rationale: bounded(item.rationale, 500), dueDate,
      target: item.target, baseline: null, unit: bounded(item.unit, 24), metric: bounded(item.metric, 120),
      evidenceKeys: [...new Set(citations)], tasks: values(item.tasks, 3).map(task => bounded(task, 180)),
    };
  });
  if (!goals.length) throw reject();
  return { summary, goals, evidence };
}
