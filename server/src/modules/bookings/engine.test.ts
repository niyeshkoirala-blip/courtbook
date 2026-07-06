import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeek, formatNPT, nowNPT, slotStartUtc } from '@courtbook/shared';
import { resolvePrice } from './pricing.js';
import { refundPct } from './booking.service.js';

/** Unit tests (§11): pricing resolver, refund calculator, NPT offset math. */

const courtBase = { basePrice: 1500, priceOverrides: [] as never[] };

describe('resolvePrice (§7.2)', () => {
  it('falls back to basePrice with no overrides', () => {
    expect(resolvePrice(courtBase, 1, 600, 660)).toBe(1500);
  });

  it('applies a generic range override when the slot fits inside it', () => {
    const court = {
      basePrice: 1500,
      priceOverrides: [{ startMin: 1020, endMin: 1260, price: 2000 }],
    };
    expect(resolvePrice(court, 1, 1080, 1140)).toBe(2000); // inside
    expect(resolvePrice(court, 1, 960, 1020)).toBe(1500); // outside
    expect(resolvePrice(court, 1, 1000, 1060)).toBe(1500); // straddles → not applied
  });

  it('day-specific override beats generic (§7.2 order)', () => {
    const court = {
      basePrice: 1500,
      priceOverrides: [
        { startMin: 1020, endMin: 1260, price: 2000 },
        { dayOfWeek: 6, startMin: 1020, endMin: 1260, price: 2500 }, // Saturday premium
      ],
    };
    expect(resolvePrice(court, 6, 1080, 1140)).toBe(2500);
    expect(resolvePrice(court, 2, 1080, 1140)).toBe(2000);
  });
});

describe('refundPct (§7.4)', () => {
  // slot: 2026-08-10 19:00 NPT = 13:15 UTC
  const date = '2026-08-10';
  const startMin = 1140;
  const slotUtc = slotStartUtc(date, startMin).getTime();

  it('100% when more than 24h ahead', () => {
    expect(refundPct(date, startMin, new Date(slotUtc - 25 * 3_600_000))).toBe(100);
  });
  it('50% between 6 and 24 hours (inclusive edges)', () => {
    expect(refundPct(date, startMin, new Date(slotUtc - 24 * 3_600_000))).toBe(50);
    expect(refundPct(date, startMin, new Date(slotUtc - 6 * 3_600_000))).toBe(50);
  });
  it('0% under 6 hours', () => {
    expect(refundPct(date, startMin, new Date(slotUtc - 5 * 3_600_000))).toBe(0);
  });
});

describe('NPT helpers (UTC+5:45 — the classic bug source, §1.8)', () => {
  it('nowNPT shifts the epoch by exactly 5h45m', () => {
    // 2026-07-06T00:00:00Z → 05:45 NPT same day
    expect(nowNPT(new Date('2026-07-06T00:00:00Z'))).toEqual({
      date: '2026-07-06',
      minutes: 345,
    });
    // 18:15 UTC → exactly midnight NPT the NEXT day
    expect(nowNPT(new Date('2026-07-06T18:15:00Z'))).toEqual({
      date: '2026-07-07',
      minutes: 0,
    });
  });

  it('slotStartUtc inverts the offset', () => {
    // 19:00 NPT on the 10th = 13:15 UTC on the 10th
    expect(slotStartUtc('2026-08-10', 1140).toISOString()).toBe('2026-08-10T13:15:00.000Z');
  });

  it('calendar helpers', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(dayOfWeek('2026-07-06')).toBe(1); // a Monday
    expect(formatNPT(0)).toBe('12:00 AM');
    expect(formatNPT(720)).toBe('12:00 PM');
    expect(formatNPT(1140)).toBe('7:00 PM');
    expect(formatNPT(345)).toBe('5:45 AM');
  });
});
