import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  formatNPT,
  nowNPT,
  type AvailabilityDay,
  type BookingDto,
  type CourtDto,
  type VenueDto,
} from '@courtbook/shared';
import { api } from '../../lib/api';
import { Skeleton } from '../../components/ui';
import { OwnerNav, VenuePicker, useOwnerVenues } from './common';

/**
 * Owner week calendar (§3.5, design/09-10): read-only week matrix per court —
 * availability states + who's booked (owner-only detail, §7.5).
 */
export function OwnerCalendarPage() {
  const { data: venues, isPending } = useOwnerVenues();
  const [venueId, setVenueId] = useState<string>();
  const venue = venues?.find((v) => v.id === venueId) ?? venues?.[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl uppercase tracking-wide text-pitch">Calendar</h1>
        {venues && venue && <VenuePicker venues={venues} value={venue.id} onChange={setVenueId} />}
      </div>
      <OwnerNav />
      {isPending ? <Skeleton className="h-80" /> : venue && <WeekMatrix venue={venue} />}
    </div>
  );
}

function WeekMatrix({ venue }: { venue: VenueDto }) {
  const today = nowNPT().date;
  const [courtId, setCourtId] = useState<string>();

  const { data } = useQuery({
    queryKey: ['venue', venue.slug],
    queryFn: () => api<{ venue: VenueDto; courts: CourtDto[] }>(`/venues/${venue.slug}`),
  });
  const court = data?.courts.find((c) => c.id === courtId) ?? data?.courts[0];

  const { data: days } = useQuery({
    queryKey: ['availability', court?.id, today],
    queryFn: () => api<AvailabilityDay[]>(`/courts/${court!.id}/availability?from=${today}&days=7`),
    enabled: !!court,
  });
  const { data: bookings } = useQuery({
    queryKey: ['owner-bookings', venue.id, today, addDays(today, 6)],
    queryFn: () =>
      api<BookingDto[]>(`/owner/venues/${venue.id}/bookings?from=${today}&to=${addDays(today, 6)}`),
  });

  // who occupies each (date, startMin) cell on this court
  const who = new Map<string, string>();
  for (const b of bookings ?? []) {
    if (court && b.courtId === court.id) {
      who.set(`${b.date}:${b.startMin}`, b.customer?.name ?? 'Online');
    }
  }

  if (!court) return <p className="text-sage">Add a court first.</p>;
  if (!days) return <Skeleton className="h-80" />;

  return (
    <div className="space-y-3">
      {(data?.courts.length ?? 0) > 1 && (
        <div className="flex gap-2">
          {data!.courts.map((c) => (
            <button
              key={c.id}
              onClick={() => setCourtId(c.id)}
              aria-pressed={c.id === court.id}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                c.id === court.id ? 'bg-pitch text-mint' : 'bg-white text-pitch hover:bg-pitch/10'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-card bg-white p-4">
        <div className="flex gap-2" style={{ minWidth: 640 }}>
          {days.map((day) => (
            <div key={day.date} className="min-w-[84px] flex-1 space-y-1">
              <p className="pb-1 text-center text-xs font-bold uppercase text-sage">
                {day.date === today
                  ? 'Today'
                  : new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en', {
                      weekday: 'short',
                      timeZone: 'UTC',
                    })}
                <span className="block font-normal">{day.date.slice(5)}</span>
              </p>
              {day.closed ? (
                <p className="pt-4 text-center text-xs text-sage">Closed</p>
              ) : (
                day.slots.map((slot) => {
                  const occupant = who.get(`${day.date}:${slot.startMin}`);
                  return (
                    <div
                      key={slot.startMin}
                      title={`${formatNPT(slot.startMin)} — ${occupant ?? slot.state}`}
                      className={`truncate rounded-md px-1.5 py-1.5 text-center text-[11px] font-semibold ${
                        slot.state === 'taken'
                          ? 'bg-accent/20 text-accent-deep'
                          : slot.state === 'blocked'
                            ? 'bg-[repeating-linear-gradient(45deg,#e8e8e4,#e8e8e4_4px,#f7f6f2_4px,#f7f6f2_8px)] text-ink/50'
                            : slot.state === 'past'
                              ? 'text-ink/20'
                              : 'bg-mint/20 text-pitch/60'
                      }`}
                    >
                      {occupant ?? formatNPT(slot.startMin).replace(':00', '')}
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-sage">
        Orange = booked (name shown) · striped = blocked · green = free
      </p>
    </div>
  );
}
