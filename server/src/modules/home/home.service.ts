import { formatNPT, nowNPT, type HomeCell, type HomeSummaryDto } from '@courtbook/shared';
import { Court } from '../courts/court.model.js';
import { Venue, type VenueDoc } from '../venues/venue.model.js';
import { Booking } from '../bookings/booking.model.js';
import { computeAvailability } from '../bookings/availability.js';

/** Number of hourly columns in the "live right now" grid. */
const COLS = 6;
/** Bookings in these states count as real earnings/activity. */
const EARNED = ['confirmed', 'completed'] as const;

/** Hourly minutes-from-midnight → short label, e.g. 1080 → "6 PM". */
function shortHour(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** Live snapshot of the top-earning approved venue (§ landing "for owners"). */
async function ownerSnapshot(todayDate: string): Promise<HomeSummaryDto['owner']> {
  // Rank approved venues by all-time earnings; take the first that's still live.
  const ranked = await Booking.aggregate<{ _id: unknown; earnings: number; bookings: number }>([
    { $match: { status: { $in: EARNED } } },
    { $group: { _id: '$venueId', earnings: { $sum: '$price' }, bookings: { $sum: 1 } } },
    { $sort: { earnings: -1 } },
    { $limit: 5 },
  ]);

  let venue: VenueDoc | null = null;
  let top: { earnings: number; bookings: number } | null = null;
  for (const row of ranked) {
    const v = await Venue.findOne({ _id: row._id, status: 'approved', deletedAt: null });
    if (v) {
      venue = v;
      top = { earnings: row.earnings, bookings: row.bookings };
      break;
    }
  }
  if (!venue || !top) return null;

  const court = await Court.findOne({ venueId: venue._id, active: true, deletedAt: null });
  const [day] = court ? await computeAvailability(court, todayDate, 1) : [];
  const slots = day?.slots ?? [];
  const freeToday = slots.filter((s) => s.state === 'available').length;
  // Next few slots today that haven't passed — real times, states, prices.
  const upcoming = slots
    .filter((s) => s.state !== 'past')
    .slice(0, 3)
    .map((s) => ({
      label: formatNPT(s.startMin),
      available: s.state === 'available',
      price: s.price ?? court?.basePrice ?? 0,
    }));

  return {
    venueName: venue.name,
    area: venue.area,
    bookings: top.bookings,
    earnings: top.earnings,
    freeToday,
    slots: upcoming,
  };
}

/**
 * Landing-page data (§ landing redesign): real counts + a live availability
 * board built from the same engine the booking flow uses (availability =
 * schedule − bookings − blocks). Nothing here is cached — it reflects the DB
 * at request time.
 */
export async function getHomeSummary(): Promise<HomeSummaryDto> {
  const [courts, bookings, venues] = await Promise.all([
    Court.countDocuments({ active: true, deletedAt: null }),
    Booking.countDocuments({ status: { $in: ['confirmed', 'completed'] } }),
    // newest approved venues first — one representative court each, up to 3
    Venue.find({ status: 'approved', deletedAt: null }).sort({ createdAt: -1 }).limit(3),
  ]);

  const now = nowNPT();
  // The next COLS whole hours from now — "live right now". Slots that fall past
  // a court's closing time simply have no availability entry → render 'booked'.
  const firstCol = Math.ceil(now.minutes / 60) * 60;
  const cols = Array.from({ length: COLS }, (_, i) => firstCol + i * 60);
  const labels = cols.map((m) => shortHour(m % (24 * 60)));

  const tonightCourts: HomeSummaryDto['tonight']['courts'] = [];
  for (const venue of venues) {
    const court = await Court.findOne({ venueId: venue._id, active: true, deletedAt: null });
    if (!court) continue;
    const [day] = await computeAvailability(court, now.date, 1);
    const stateByStart = new Map((day?.slots ?? []).map((s) => [s.startMin, s.state]));

    // First open slot in the row is the highlighted 'free' (book now); the rest
    // of the open ones are 'open'; taken/blocked/past/closed all read 'booked'.
    let freeMarked = false;
    const cells: HomeCell[] = cols.map((startMin) => {
      if (stateByStart.get(startMin) !== 'available') return 'booked';
      if (freeMarked) return 'open';
      freeMarked = true;
      return 'free';
    });
    tonightCourts.push({ venueName: venue.name, area: venue.area, cells });
  }

  const [owner, latest] = await Promise.all([
    ownerSnapshot(now.date),
    Booking.findOne({ status: { $in: EARNED } }).sort({ date: -1, startMin: -1 }),
  ]);

  let recentBooking: HomeSummaryDto['recentBooking'] = null;
  if (latest) {
    const v = await Venue.findOne({ _id: latest.venueId });
    if (v) {
      recentBooking = {
        venueName: v.name,
        label: formatNPT(latest.startMin),
        price: latest.price,
      };
    }
  }

  return {
    stats: { courts, bookings },
    tonight: { labels, courts: tonightCourts },
    owner,
    recentBooking,
  };
}
