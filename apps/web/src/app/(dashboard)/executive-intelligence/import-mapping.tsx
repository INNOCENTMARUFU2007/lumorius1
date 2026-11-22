'use client';

/** Must match FIXED_VALUE_PREFIX in apps/api/src/executive-intelligence/executive-import.service.ts. */
export const FIXED_VALUE_PREFIX = '__fixed__:';
const FIXED_OPTION = '__fixed_option__';

/** Suggested fixed values for fields that are often missing from a file. */
const FIXED_SUGGESTIONS: Record<string, string[]> = {
  currency: ['USD', 'EUR', 'GBP', 'AED', 'ZAR', 'NGN', 'KES', 'GHS', 'INR'],
  transaction_type: ['operating_expense', 'revenue', 'refund', 'acquisition_cost', 'cost_of_goods_sold', 'other_income', 'tax', 'capital_expenditure'],
  status: ['active', 'open', 'won', 'lost', 'trialing', 'paused', 'cancelled', 'expired'],
  billing_interval: ['monthly', 'annual', 'quarterly', 'weekly'],
  channel: ['paid_search', 'social', 'email', 'referral', 'events'],
  attribution_model: ['last_touch', 'first_touch', 'linear'],
};

const humanize = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Column mapping for a staged import. Each field takes a source column, or a fixed
 * value for every row when the file has no such column (e.g. Currency = USD).
 * A column used for more than one field is allowed but called out.
 */
export function ImportMapping({
  fields,
  headers,
  mapping,
  onChange,
}: {
  fields: { required: string[]; optional: string[] };
  headers: string[];
  mapping: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const set = (field: string, value: string) => onChange({ ...mapping, [field]: value });

  const usage = new Map<string, string[]>();
  for (const [field, source] of Object.entries(mapping)) {
    if (!source || source.startsWith(FIXED_VALUE_PREFIX)) continue;
    usage.set(source, [...(usage.get(source) ?? []), field]);
  }
  const reused = [...usage.entries()].filter(([, used]) => used.length > 1);

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[...fields.required, ...fields.optional].map((field) => {
          const required = fields.required.includes(field);
          const value = mapping[field] ?? '';
          const isFixed = value.startsWith(FIXED_VALUE_PREFIX);
          const fixedValue = isFixed ? value.slice(FIXED_VALUE_PREFIX.length) : '';
          const listId = `fixed-${field}`;
          return (
            <div key={field} className="rounded-xl border border-border bg-muted/50 p-3">
              <label htmlFor={`map-${field}`} className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-foreground/80">
                <span>{humanize(field)}</span>
                <span className={required ? 'text-rose-700 dark:text-rose-300' : 'text-muted-foreground'}>{required ? 'Required' : 'Optional'}</span>
              </label>
              <select
                id={`map-${field}`}
                value={isFixed ? FIXED_OPTION : value}
                onChange={(event) => set(field, event.target.value === FIXED_OPTION ? FIXED_VALUE_PREFIX : event.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs text-foreground/90 outline-none focus:border-primary/50"
              >
                <option value="">Not mapped</option>
                {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                <option value={FIXED_OPTION}>Same value for every row…</option>
              </select>
              {isFixed && (
                <>
                  <input
                    aria-label={`Fixed value for ${humanize(field)}`}
                    list={FIXED_SUGGESTIONS[field] ? listId : undefined}
                    value={fixedValue}
                    autoFocus
                    maxLength={100}
                    placeholder={FIXED_SUGGESTIONS[field]?.[0] ? `e.g. ${FIXED_SUGGESTIONS[field][0]}` : 'Value for every row'}
                    onChange={(event) => set(field, FIXED_VALUE_PREFIX + event.target.value)}
                    className="mt-2 h-9 w-full rounded-lg border border-border bg-background px-2.5 font-mono text-xs outline-none focus:border-primary/50"
                  />
                  {FIXED_SUGGESTIONS[field] && (
                    <datalist id={listId}>
                      {FIXED_SUGGESTIONS[field].map((option) => <option key={option} value={option} />)}
                    </datalist>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {reused.length > 0 && (
        <p role="status" className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs text-foreground">
          {reused.map(([source, used]) => `“${source}” is used for ${used.map(humanize).join(' and ')}`).join('; ')}. That's allowed — check it's what you meant.
        </p>
      )}
    </div>
  );
}

/** A mapping counts as filled when it names a column or a non-empty fixed value. */
export function isMapped(value: string | undefined): boolean {
  if (!value) return false;
  if (value.startsWith(FIXED_VALUE_PREFIX)) return value.length > FIXED_VALUE_PREFIX.length;
  return true;
}
