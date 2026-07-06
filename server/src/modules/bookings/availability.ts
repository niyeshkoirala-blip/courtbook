import { Types } from 'mongoose';
import { addDays, dayOfWeek, nowNPT, type AvailabilityDay } from '@courtbook/shared';
import { AppError } from '../../core/errors.js';
import { Court, type CourtDoc } from '../courts/court.model.js';
import { Venue } from '../venues/venue.model.js';
import { Booking } from './booking.model.js';
import { Block } from './block.model.js';
import { resolvePrice } from './pricing.js';

/**
 * Availability = schedule − bookings − blocks (decision D-7: slots are
 * derived, never stored). Exactly 3 indexed queries then in-memory assembly
 * (§9) — never cached (§2.5: correctness > speed).
 */

export async function getBookableCourt(courtId: string): Promise<CourtDoc> {
  if (!Types.ObjectId.isValid(courtId)) throw new AppError('NOT_FOUND', 404, 'Court not found');
  const court = await Court.findOne({ _id: courtId, active: true, deletedAt: null });
  if (!court) throw new AppError('NOT_FOUND', 404, 'Court not found');
  const venue = await Venue.findOne({ _id: court.venueId, status: 'approved', deletedAt: null });
  if (!venue) throw new AppError('NOT_FOUND', 404, 'Court not found');
  return court;
}

export async function computeAvailability(
  court: CourtDoc,
  from: string,
  days: number,
): Promise<AvailabilityDay[]> {
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  const [bookings, blocks] = await Promise.all([
    Booking.find({
      courtId: court._id,
      date: { $in: dates },
      status: { $in: ['pending_payment', 'confirmed'] },
    }),
    Block.find({ courtId: court._id, date: { $in: dates } }),
  ]);

  const takenByDate = new Map<string, Set<number>>();
  for (const b of bookings) {
    if (!takenByDate.has(b.date)) takenByDate.set(b.date, new Set());
    takenByDate.get(b.date)!.add(b.startMin);
  }

  const now = nowNPT();

  return dates.map((date) => {
    const day = court.schedule[dayOfWeek(date)];
    if (!day || day.closed) return { date, closed: true, slots: [] };

    const open = day.openMin ?? 0;
    const close = day.closeMin ?? 0;
    const slots = [];
    for (let start = open; start + court.slotMinutes <= close; start += court.slotMinutes) {
      const end = start + court.slotMinutes;
      const isPast = date < now.date || (date === now.date && start <= now.minutes);
      const isTaken = takenByDate.get(date)?.has(start) ?? false;
      const isBlocked = blocks.some(
        (bl) => bl.date === date && start < bl.endMin && end > bl.startMin,
      );
      const state = isPast ? 'past' : isTaken ? 'taken' : isBlocked ? 'blocked' : 'available';
      slots.push({
        startMin: start,
        endMin: end,
        state: state as 'past' | 'taken' | 'blocked' | 'available',
        ...(state === 'available' && {
          price: resolvePrice(court, dayOfWeek(date), start, end),
        }),
      });
    }
    return { date, closed: false, slots };
  });
}

/** Same-day free slots nearest the missed one — the 409 SLOT_TAKEN consolation (§3.2). */
export async function sameDayAlternatives(
  court: CourtDoc,
  date: string,
  missedStartMin: number,
): Promise<{ startMin: number; endMin: number; price: number }[]> {
  const [day] = await computeAvailability(court, date, 1);
  return (day?.slots ?? [])
    .filter((s) => s.state === 'available')
    .sort((a, b) => Math.abs(a.startMin - missedStartMin) - Math.abs(b.startMin - missedStartMin))
    .slice(0, 3)
    .map((s) => ({ startMin: s.startMin, endMin: s.endMin, price: s.price ?? court.basePrice }));
}
