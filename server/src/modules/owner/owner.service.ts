import type { BookingDto, VenueDto } from '@courtbook/shared';
import { addDays, dayOfWeek } from '@courtbook/shared';
import { Venue, toVenueDto } from '../venues/venue.model.js';
import { findOwnedVenue } from '../venues/venue.service.js';
import { Court } from '../courts/court.model.js';
import { Booking, toBookingDto, type BookingDoc } from '../bookings/booking.model.js';

/** Owner dashboard reads (§3.4/§3.5). Ownership re-checked on every call (§2.7). */

export async function listOwnerVenues(ownerId: string): Promise<VenueDto[]> {
  const venues = await Venue.find({ ownerId, deletedAt: null }).sort({ createdAt: 1 });
  return venues.map(toVenueDto);
}

/**
 * Bookings for the owner's venue in a date range. Includes walk-in customer
 * name/phone — §7.5 allows this only for the venue's own owner.
 */
export async function listVenueBookings(
  venueId: string,
  ownerId: string,
  from: string,
  to: string,
): Promise<BookingDto[]> {
  await findOwnedVenue(venueId, ownerId);
  const courts = await Court.find({ venueId }).select('name');
  const names = new Map(courts.map((c) => [c.id as string, c.name]));

  const bookings = await Booking.find({
    venueId,
    date: { $gte: from, $lte: to },
    status: { $in: ['pending_payment', 'confirmed', 'completed', 'no_show'] },
  }).sort({ date: 1, startMin: 1 });

  return bookings.map((b: BookingDoc) => {
    const courtName = names.get(b.courtId.toString());
    return toBookingDto(b, courtName ? { courtName } : undefined);
  });
}

export interface VenueStats {
  totalBookings: number;
  revenue: number; // NPR, confirmed+completed only
  occupancyPct: number; // booked open-hours / available open-hours
  perDay: { date: string; bookings: number; revenue: number }[];
}

/** Reports data (§3.5): totals + per-day series; CSV is assembled client-side. */
export async function venueStats(
  venueId: string,
  ownerId: string,
  from: string,
  to: string,
): Promise<VenueStats> {
  await findOwnedVenue(venueId, ownerId);
  const courts = await Court.find({ venueId, active: true, deletedAt: null });
  const bookings = await Booking.find({
    venueId,
    date: { $gte: from, $lte: to },
    status: { $in: ['confirmed', 'completed'] },
  });

  const dates: string[] = [];
  for (let d = from; d <= to && dates.length < 366; d = addDays(d, 1)) dates.push(d);

  const perDayMap = new Map(dates.map((date) => [date, { date, bookings: 0, revenue: 0 }]));
  let bookedMinutes = 0;
  for (const b of bookings) {
    const day = perDayMap.get(b.date);
    if (!day) continue;
    day.bookings += 1;
    day.revenue += b.price;
    bookedMinutes += b.endMin - b.startMin;
  }

  // available minutes = sum over dates × active courts of that weekday's window
  let openMinutes = 0;
  for (const date of dates) {
    const dow = dayOfWeek(date);
    for (const court of courts) {
      const day = court.schedule[dow];
      if (day && !day.closed) openMinutes += (day.closeMin ?? 0) - (day.openMin ?? 0);
    }
  }

  const perDay = [...perDayMap.values()];
  return {
    totalBookings: bookings.length,
    revenue: perDay.reduce((sum, d) => sum + d.revenue, 0),
    occupancyPct: openMinutes > 0 ? Math.round((bookedMinutes / openMinutes) * 100) : 0,
    perDay,
  };
}
