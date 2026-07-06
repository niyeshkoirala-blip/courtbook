import { Types } from 'mongoose';
import {
  addDays,
  dayOfWeek,
  formatNPT,
  nowNPT,
  slotStartUtc,
  type BlockCreateInput,
  type BlockDto,
  type BookingCreateInput,
  type BookingDto,
  type WalkinCreateInput,
} from '@courtbook/shared';
import { AppError } from '../../core/errors.js';
import { User } from '../users/user.model.js';
import { Venue } from '../venues/venue.model.js';
import { findOwnedVenue } from '../venues/venue.service.js';
import { Court, type CourtDoc } from '../courts/court.model.js';
import { queueEmail } from '../notifications/outbox.js';
import { Booking, toBookingDto, type BookingDoc } from './booking.model.js';
import { Block, toBlockDto } from './block.model.js';
import { getBookableCourt, sameDayAlternatives } from './availability.js';
import { resolvePrice } from './pricing.js';

/** Rule constants (blueprint §7.1, §2.10). */
const LEAD_TIME_MIN = 30;
const MAX_DAYS_AHEAD = 14;
const HOLD_MS = 10 * 60 * 1000; // pending_payment hold
const MAX_PENDING_HOLDS = 3;

/**
 * §7.1 slot validity. Throws 422 SLOT_INVALID with a human reason.
 * Returns the slot's end minute and resolved price.
 */
async function validateSlot(
  court: CourtDoc,
  date: string,
  startMin: number,
): Promise<{ endMin: number; price: number }> {
  const invalid = (why: string) => new AppError('SLOT_INVALID', 422, why);
  const now = nowNPT();

  if (date > addDays(now.date, MAX_DAYS_AHEAD)) {
    throw invalid(`Bookings open up to ${MAX_DAYS_AHEAD} days ahead`);
  }
  const day = court.schedule[dayOfWeek(date)];
  if (!day || day.closed) throw invalid('The venue is closed that day');
  const open = day.openMin ?? 0;
  const close = day.closeMin ?? 0;
  const endMin = startMin + court.slotMinutes;
  if (startMin < open || endMin > close || (startMin - open) % court.slotMinutes !== 0) {
    throw invalid('Slot does not match the court schedule');
  }
  // lead time: slot must start ≥30 min from now (also excludes the past)
  if (slotStartUtc(date, startMin).getTime() < Date.now() + LEAD_TIME_MIN * 60_000) {
    throw invalid(`Slots must be booked at least ${LEAD_TIME_MIN} minutes in advance`);
  }
  const blocked = await Block.exists({
    courtId: court._id,
    date,
    startMin: { $lt: endMin },
    endMin: { $gt: startMin },
  });
  if (blocked) throw invalid('That time is blocked by the venue');

  return { endMin, price: resolvePrice(court, dayOfWeek(date), startMin, endMin) };
}

/**
 * §7.3 — the crown jewel. No locks, no check-then-insert race: the unique
 * partial index is the final arbiter, a duplicate key anywhere in the race
 * maps to 409 SLOT_TAKEN. Load test gate: N concurrent → exactly one 201.
 */
export async function createBooking(
  input: BookingCreateInput,
  userId: string,
): Promise<{ booking: BookingDto; paymentOptions: string[] }> {
  // idempotent retry (§4.5): same user + key → the original result, no double hold
  if (input.idempotencyKey) {
    const existing = await Booking.findOne({ userId, idempotencyKey: input.idempotencyKey });
    if (existing) return withPaymentOptions(existing);
  }

  const court = await getBookableCourt(input.courtId);
  const { endMin, price } = await validateSlot(court, input.date, input.startMin);

  // §7.1 abuse cap: max 3 simultaneous unpaid holds
  const holds = await Booking.countDocuments({ userId, status: 'pending_payment' });
  if (holds >= MAX_PENDING_HOLDS) {
    throw new AppError('TOO_MANY_HOLDS', 429, 'You already have 3 unpaid bookings on hold');
  }

  try {
    const booking = await Booking.create({
      courtId: court._id,
      venueId: court.venueId, // denormalized at create, never updated
      userId,
      date: input.date,
      startMin: input.startMin,
      endMin,
      status: 'pending_payment',
      price,
      channel: 'online',
      expiresAt: new Date(Date.now() + HOLD_MS),
      ...(input.idempotencyKey && { idempotencyKey: input.idempotencyKey }),
    });
    return withPaymentOptions(booking);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 11000) {
      throw new AppError('SLOT_TAKEN', 409, 'That slot was just booked.', {
        alternatives: await sameDayAlternatives(court, input.date, input.startMin),
      });
    }
    throw err;
  }
}

async function withPaymentOptions(
  booking: BookingDoc,
): Promise<{ booking: BookingDto; paymentOptions: string[] }> {
  const venue = await Venue.findById(booking.venueId);
  return {
    booking: toBookingDto(booking),
    paymentOptions: ['esewa', 'khalti', ...(venue?.payAtVenue ? ['venue'] : [])],
  };
}

/** Walk-ins (§3.4): same atomic path, immediately confirmed, no payment. */
export async function createWalkin(input: WalkinCreateInput, ownerId: string): Promise<BookingDto> {
  const court = await getBookableCourt(input.courtId);
  await findOwnedVenue(court.venueId.toString(), ownerId); // ownership (§2.7)
  const { endMin, price } = await validateSlot(court, input.date, input.startMin);

  try {
    const booking = await Booking.create({
      courtId: court._id,
      venueId: court.venueId,
      date: input.date,
      startMin: input.startMin,
      endMin,
      status: 'confirmed',
      price,
      channel: 'walk_in',
      ...(input.customer && { customer: input.customer }),
    });
    return toBookingDto(booking);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 11000) {
      // walk-ins can lose the race too (§3.4)
      throw new AppError('SLOT_TAKEN', 409, 'That slot was just booked.', {
        alternatives: await sameDayAlternatives(court, input.date, input.startMin),
      });
    }
    throw err;
  }
}

/** §7.4 refund policy: >24h 100% · 6–24h 50% · <6h 0%. After start: no cancel. */
export function refundPct(date: string, startMin: number, at: Date = new Date()): number {
  const hoursLeft = (slotStartUtc(date, startMin).getTime() - at.getTime()) / 3_600_000;
  if (hoursLeft > 24) return 100;
  if (hoursLeft >= 6) return 50;
  return 0;
}

export async function cancelBooking(
  bookingId: string,
  userId: string,
  reason?: string,
): Promise<BookingDto> {
  if (!Types.ObjectId.isValid(bookingId)) throw new AppError('NOT_FOUND', 404, 'Booking not found');
  const booking = await Booking.findOne({ _id: bookingId, userId });
  if (!booking) throw new AppError('NOT_FOUND', 404, 'Booking not found');
  if (booking.status !== 'pending_payment' && booking.status !== 'confirmed') {
    throw new AppError('INVALID_STATUS', 409, `A ${booking.status} booking cannot be cancelled`);
  }
  if (slotStartUtc(booking.date, booking.startMin).getTime() <= Date.now()) {
    throw new AppError('TOO_LATE_TO_CANCEL', 409, 'The slot has already started');
  }

  const pct = refundPct(booking.date, booking.startMin);
  booking.status = 'cancelled'; // falls out of the partial index → slot reopens
  booking.set('cancellation', {
    at: new Date(),
    by: 'player',
    refundPct: pct,
    ...(reason && { reason }),
  });
  await booking.save();

  // §7.6: notify both sides; refund settlement is manual in MVP (§6.2)
  const [player, venue] = await Promise.all([
    User.findById(userId),
    Venue.findById(booking.venueId),
  ]);
  const slotLabel = `${booking.date} ${formatNPT(booking.startMin)}`;
  if (player) {
    await queueEmail(player.email, 'booking_cancelled', {
      name: player.name,
      slot: slotLabel,
      refundPct: String(pct),
    });
  }
  const owner = venue && (await User.findById(venue.ownerId));
  if (owner) {
    await queueEmail(owner.email, 'booking_cancelled_owner', {
      name: owner.name,
      venueName: venue.name,
      slot: slotLabel,
    });
  }
  return toBookingDto(booking);
}

/** GET /bookings/:id — booking owner or the venue's owner (§4.4). */
export async function getBooking(
  bookingId: string,
  viewer: { id: string; role: string },
): Promise<BookingDto> {
  if (!Types.ObjectId.isValid(bookingId)) throw new AppError('NOT_FOUND', 404, 'Booking not found');
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new AppError('NOT_FOUND', 404, 'Booking not found');

  const isBookingOwner = booking.userId?.toString() === viewer.id;
  const venue = await Venue.findById(booking.venueId);
  const isVenueOwner = venue?.ownerId.toString() === viewer.id;
  if (!isBookingOwner && !isVenueOwner && viewer.role !== 'admin') {
    throw new AppError('NOT_FOUND', 404, 'Booking not found');
  }
  const court = await Court.findById(booking.courtId);
  return toBookingDto(booking, {
    ...(court && { courtName: court.name }),
    ...(venue && { venueName: venue.name }),
  });
}

export async function listMyBookings(
  userId: string,
  query: { status?: string | undefined; cursor?: string | undefined; limit: number },
): Promise<{ bookings: BookingDto[]; nextCursor?: string }> {
  const filter: Record<string, unknown> = { userId };
  if (query.status) filter.status = query.status;
  if (query.cursor) filter._id = { $lt: new Types.ObjectId(query.cursor) };

  const docs = await Booking.find(filter)
    .sort({ _id: -1 })
    .limit(query.limit + 1)
    .populate<{ courtId: { name: string } }>('courtId', 'name')
    .populate<{ venueId: { name: string } }>('venueId', 'name');

  const page = docs.slice(0, query.limit);
  return {
    bookings: page.map((b) => {
      const courtName = (b.courtId as { name?: string })?.name;
      const venueName = (b.venueId as { name?: string })?.name;
      return toBookingDto(b as unknown as BookingDoc, {
        ...(courtName && { courtName }),
        ...(venueName && { venueName }),
      });
    }),
    ...(docs.length > query.limit && { nextCursor: page[page.length - 1]!.id as string }),
  };
}

/** Owner blocks (§4.4): 409 with the conflict list — never silently kill bookings (§6.4). */
export async function createBlock(input: BlockCreateInput, ownerId: string): Promise<BlockDto> {
  const court = await Court.findOne({ _id: input.courtId, deletedAt: null });
  if (!court) throw new AppError('NOT_FOUND', 404, 'Court not found');
  await findOwnedVenue(court.venueId.toString(), ownerId);

  const conflicts = await Booking.find({
    courtId: court._id,
    date: input.date,
    status: { $in: ['pending_payment', 'confirmed'] },
    startMin: { $lt: input.endMin },
    endMin: { $gt: input.startMin },
  });
  if (conflicts.length > 0) {
    throw new AppError('HAS_BOOKINGS', 409, 'Existing bookings overlap this block', {
      conflicts: conflicts.map((c) => toBookingDto(c)),
    });
  }
  const block = await Block.create({ ...input, createdBy: ownerId });
  return toBlockDto(block);
}

export async function deleteBlock(blockId: string, ownerId: string): Promise<void> {
  if (!Types.ObjectId.isValid(blockId)) throw new AppError('NOT_FOUND', 404, 'Block not found');
  const block = await Block.findById(blockId);
  if (!block) throw new AppError('NOT_FOUND', 404, 'Block not found');
  const court = await Court.findById(block.courtId);
  if (court) await findOwnedVenue(court.venueId.toString(), ownerId);
  await block.deleteOne();
}
