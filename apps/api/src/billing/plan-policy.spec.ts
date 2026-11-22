import { planPolicy, resolvePlan, trialEndsAt } from './plan-policy';

const now = new Date('2026-11-21T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe('plan policy', () => {
  it('limits Starter to the two base agents and the core module', () => {
    const starter = planPolicy('starter');
    expect(starter.agents).toEqual(['chief-of-staff', 'integration-engineer']);
    expect(starter.features).toEqual([]);
    expect(starter.modules).toEqual(['core']);
  });

  it('makes each paid tier a strict superset of the one below', () => {
    const tiers = ['starter', 'growth', 'professional'].map(planPolicy);
    for (let i = 1; i < tiers.length; i += 1) {
      tiers[i - 1].agents.forEach((a) => expect(tiers[i].agents).toContain(a));
      tiers[i - 1].features.forEach((f) => expect(tiers[i].features).toContain(f));
      tiers[i - 1].modules.forEach((m) => expect(tiers[i].modules).toContain(m));
    }
    expect(planPolicy('growth').modules).toEqual(expect.arrayContaining(['workflows', 'decisions']));
    expect(planPolicy('growth').features).toContain('advanced_financial');
    expect(planPolicy('growth').features).not.toContain('advanced_governance');
    expect(planPolicy('professional').features).toEqual(expect.arrayContaining(['advanced_financial', 'advanced_governance']));
  });

  it('gives the trial Growth access and an expired workspace nothing', () => {
    expect(planPolicy('trial')).toEqual(planPolicy('growth'));
    expect(planPolicy('expired')).toEqual({ agents: [], features: [], modules: [] });
  });

  it('never grants deferred features', () => {
    for (const plan of ['trial', 'starter', 'growth', 'professional', 'expired']) {
      expect(planPolicy(plan).features).not.toContain('business_twin');
    }
  });

  it('grants the profit and finance analyst on plans with advanced financial features only', () => {
    for (const plan of ['trial', 'growth', 'professional']) expect(planPolicy(plan).agents).toContain('financial-analyst');
    for (const plan of ['starter', 'expired']) expect(planPolicy(plan).agents).not.toContain('financial-analyst');
  });
});

describe('resolvePlan', () => {
  it('treats the organisation plan as authoritative for paid tiers', () => {
    expect(resolvePlan({ plan_id: 'growth', trial_ends_at: null, created_at: daysAgo(400) }, now)).toBe('growth');
  });

  it('runs a 14-day trial from trial_ends_at, or from creation when unset', () => {
    expect(resolvePlan({ plan_id: 'free', trial_ends_at: null, created_at: daysAgo(3) }, now)).toBe('trial');
    expect(resolvePlan({ plan_id: 'free', trial_ends_at: null, created_at: daysAgo(15) }, now)).toBe('expired');
    expect(resolvePlan({ plan_id: 'free', trial_ends_at: daysAgo(-1), created_at: daysAgo(30) }, now)).toBe('trial');
    expect(trialEndsAt({ trial_ends_at: null, created_at: daysAgo(0) }).getTime() - now.getTime()).toBe(14 * 86_400_000);
  });

  it('fails closed for missing, unknown and legacy tiers', () => {
    expect(resolvePlan(null, now)).toBe('expired');
    expect(resolvePlan({ plan_id: 'enterprise', trial_ends_at: null, created_at: daysAgo(1) }, now)).toBe('expired');
    expect(resolvePlan({ plan_id: 'custom', trial_ends_at: null, created_at: daysAgo(1) }, now)).toBe('expired');
  });
});
