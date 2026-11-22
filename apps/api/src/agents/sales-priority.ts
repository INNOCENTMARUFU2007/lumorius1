const DAY = 86_400_000;
function date(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function salesPriority(record: Record<string, unknown>, now: number) {
  // A follow-up priority is a timing signal. It does not infer consent or likelihood to buy.
  if (record.kind !== 'deal' || record.closed !== false) return { score: null, reasons: ['Open opportunity status is unverified'] };
  const today = Math.floor(now / DAY);
  const latest = date(record.lastActivity);
  const expected = date(record.closeDate);
  const sinceActivity = latest === null ? null : today - Math.floor(latest / DAY);
  const untilClose = expected === null ? null : Math.floor(expected / DAY) - today;
  const reasons: string[] = [];
  let score = 0;
  let evidence = 0;
  if (sinceActivity !== null && sinceActivity >= 0) {
    evidence++;
    if (sinceActivity >= 7) { score += 50; reasons.push('No recorded activity for ' + sinceActivity + ' days'); }
    else reasons.push('Recorded activity within 7 days');
  } else reasons.push('Activity date unavailable');
  if (untilClose !== null) {
    evidence++;
    if (untilClose < 0) { score += 50; reasons.push('Expected close date passed'); }
    else if (untilClose <= 14) { score += 40; reasons.push('Expected close within 14 days'); }
    else reasons.push('Expected close more than 14 days away');
  } else reasons.push('Expected close date unavailable');
  return { score: evidence ? score : null, reasons };
}
