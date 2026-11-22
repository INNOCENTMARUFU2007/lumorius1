// PostgreSQL accepts canonical UUID text regardless of version or variant bits.
export const BRIEFING_ITEM_KEY = /^([a-z_]+):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const briefingLookback = (cadence: string) => cadence === 'monthly' ? 30 : cadence === 'weekly' ? 7 : 1;
