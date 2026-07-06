import type { CourtDoc } from '../courts/court.model.js';

/**
 * Price resolution (blueprint §7.2), most specific wins:
 * override(dayOfWeek + range) → override(range only) → court.basePrice.
 * An override applies when the slot sits fully inside its range.
 * The result is snapshotted onto the booking — later price edits never
 * touch existing bookings.
 */
export function resolvePrice(
  court: Pick<CourtDoc, 'basePrice' | 'priceOverrides'>,
  dow: number,
  startMin: number,
  endMin: number,
): number {
  const covering = court.priceOverrides.filter(
    (o) =>
      startMin >= (o.startMin ?? 0) &&
      endMin <= (o.endMin ?? 0) &&
      (o.dayOfWeek === null || o.dayOfWeek === undefined || o.dayOfWeek === dow),
  );
  const daySpecific = covering.find((o) => o.dayOfWeek === dow);
  const generic = covering.find((o) => o.dayOfWeek === null || o.dayOfWeek === undefined);
  return daySpecific?.price ?? generic?.price ?? court.basePrice;
}
