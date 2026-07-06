/**
 * Asia/Kathmandu time helpers (blueprint §3.0/§1.8). NPT is UTC+5:45 with no
 * DST — a fixed offset, so plain arithmetic beats a timezone library.
 * All slot times across the app are minutes-from-midnight NPT (§5.2).
 */

export const NPT_OFFSET_MIN = 5 * 60 + 45; // +5:45

/** Current date + wall-clock minutes in Kathmandu, derived from epoch. */
export function nowNPT(at: Date = new Date()): { date: string; minutes: number } {
  const shifted = new Date(at.getTime() + NPT_OFFSET_MIN * 60_000);
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** "YYYY-MM-DD" + n days → "YYYY-MM-DD" (calendar math, TZ-free). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Day of week for a date string, 0 = Sunday — matches schedule[7] indexing. */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Slot start as a UTC instant (for expiry/refund math). */
export function slotStartUtc(date: string, startMin: number): Date {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + (startMin - NPT_OFFSET_MIN) * 60_000);
}

/** Minutes-from-midnight → "6:00 AM" / "7:30 PM" (the formatNPT util, CLAUDE.md). */
export function formatNPT(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}
