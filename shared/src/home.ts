/** Landing-page summary DTO (public) — real counts + a live availability board. */

/** A cell in the "live right now" grid, mirroring the three visual states. */
export type HomeCell = 'free' | 'open' | 'booked';

export interface HomeSummaryDto {
  stats: {
    /** Active, listed courts across all approved venues. */
    courts: number;
    /** Confirmed + completed bookings all-time ("matches booked"). */
    bookings: number;
  };
  tonight: {
    /** Column labels for the grid, e.g. ["6 PM", "7 PM", …] — one per cell. */
    labels: string[];
    /** One representative court per approved venue (up to 3). */
    courts: { venueName: string; area: string; cells: HomeCell[] }[];
  };
  /** Live snapshot of the top-earning approved venue (null if none). */
  owner: {
    venueName: string;
    area: string;
    /** All-time confirmed + completed bookings for this venue. */
    bookings: number;
    /** All-time earnings (Rs) from confirmed + completed bookings. */
    earnings: number;
    /** Available slots for its representative court today. */
    freeToday: number;
    /** Next few slots today for that court — real times, states, prices. */
    slots: { label: string; available: boolean; price: number }[];
  } | null;
  /** Most recent confirmed/completed booking, for the "just booked" chip. */
  recentBooking: { venueName: string; label: string; price: number } | null;
}
