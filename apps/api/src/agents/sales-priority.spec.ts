import { salesPriority } from './sales-priority';

const today = Date.parse('2026-11-17T08:00:00Z');
describe('CRM follow-up priority', () => {
  it('explains the contribution of inactivity and an overdue close date separately', () => {
    expect(salesPriority({ kind:'deal', closed:false, lastActivity:'2026-11-10', closeDate:'2026-11-16' }, today)).toEqual({
      score: 100, reasons: ['No recorded activity for 7 days', 'Expected close date passed'],
    });
  });

  it('withholds a score when the opportunity or timing is unverified', () => {
    for (const row of [
      { kind:'deal', closed:true, closeDate:'2026-11-16' },
      { kind:'contact', closed:false, closeDate:'2026-11-16' },
      { kind:'deal', closed:false, lastActivity:'2026-11-18', closeDate:'unknown' },
    ]) expect(salesPriority(row, today).score).toBeNull();
  });
});
