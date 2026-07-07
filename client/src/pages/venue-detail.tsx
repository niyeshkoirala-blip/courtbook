import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  formatNPT,
  nowNPT,
  type AvailabilityDay,
  type CourtDto,
  type VenueDto,
} from '@courtbook/shared';
import { api, post, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';
import { Button, Skeleton } from '../components/ui';

/** The money page (§3.2, design/03): availability grid + sticky booking bar. */

interface Selection {
  courtId: string;
  date: string;
  startMin: number;
  price: number;
}

const SELECTION_KEY = 'courtbook:pending-selection';

export function VenueDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [courtId, setCourtId] = useState<string>();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [booking, setBooking] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ['venue', slug],
    queryFn: () => api<{ venue: VenueDto; courts: CourtDto[] }>(`/venues/${slug}`),
  });
  const court = data?.courts.find((c) => c.id === courtId) ?? data?.courts[0];

  const from = nowNPT().date;
  const {
    data: days,
    isPending: gridPending,
    refetch,
  } = useQuery({
    queryKey: ['availability', court?.id, from],
    queryFn: () => api<AvailabilityDay[]>(`/courts/${court!.id}/availability?from=${from}&days=7`),
    enabled: !!court,
    refetchInterval: 60_000, // §3.2: 60s polling — the server is the only truth
  });

  // restore a selection stashed before a login redirect (§3.2)
  useEffect(() => {
    const raw = sessionStorage.getItem(SELECTION_KEY);
    if (raw && user && data) {
      sessionStorage.removeItem(SELECTION_KEY);
      setSelection(JSON.parse(raw) as Selection);
    }
  }, [user, data]);

  async function book() {
    if (!selection) return;
    if (!user) {
      sessionStorage.setItem(SELECTION_KEY, JSON.stringify(selection));
      navigate(`/auth/login?next=${encodeURIComponent(`/venues/${slug}`)}`);
      return;
    }
    setBooking(true); // §3.2: button disables on first click
    try {
      const created = await post<{ id: string }>('/bookings', {
        courtId: selection.courtId,
        date: selection.date,
        startMin: selection.startMin,
        idempotencyKey: crypto.randomUUID(), // network-retry-proof (§4.5)
      });
      navigate(`/book/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SLOT_TAKEN') {
        toast.error('Just missed it — that slot was taken. Pick another free slot.');
        setSelection(null);
        void refetch();
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Booking failed — try again');
      }
    } finally {
      setBooking(false);
    }
  }

  if (isPending) return <Skeleton className="h-96" />;
  if (!data) return null;

  return (
    <div className="space-y-6 pb-24">
      <header>
        <h1 className="font-display text-3xl uppercase tracking-wide text-pitch">
          {data.venue.name}
        </h1>
        <p className="text-sage">{data.venue.area}</p>
        {data.venue.amenities.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1">
            {data.venue.amenities.map((a) => (
              <span
                key={a}
                className="rounded-full bg-mint/30 px-2 py-0.5 text-xs font-medium text-pitch"
              >
                {a.replace(/_/g, ' ')}
              </span>
            ))}
          </p>
        )}
        {data.venue.description && (
          <p className="mt-3 max-w-2xl text-sm">{data.venue.description}</p>
        )}
      </header>

      {data.courts.length > 1 && (
        <div role="tablist" aria-label="Courts" className="flex gap-2">
          {data.courts.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === court?.id}
              onClick={() => {
                setCourtId(c.id);
                setSelection(null);
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                c.id === court?.id ? 'bg-pitch text-mint' : 'bg-white text-pitch hover:bg-pitch/10'
              }`}
            >
              {c.name} · {c.size}
            </button>
          ))}
        </div>
      )}

      {!court ? (
        <p className="text-sage">No courts listed yet.</p>
      ) : gridPending || !days ? (
        <Skeleton className="h-80" />
      ) : (
        <AvailabilityGrid
          days={days}
          selection={selection}
          onSelect={(date, startMin, price) =>
            setSelection({ courtId: court.id, date, startMin, price })
          }
        />
      )}

      {/* sticky booking bar (§3.2) */}
      {selection && court && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-pitch/10 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <p className="text-sm">
              <strong className="font-display uppercase text-pitch">{court.name}</strong> ·{' '}
              {selection.date} {formatNPT(selection.startMin)} ·{' '}
              <strong>Rs {selection.price}</strong>
            </p>
            <Button onClick={book} loading={booking} size="lg">
              Book this slot
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The grid (§3.2/§3.6): columns = next 7 days, rows = slots. Cell states:
 * available (price) / taken / blocked / past / selected. Arrow-key navigable.
 */
function AvailabilityGrid({
  days,
  selection,
  onSelect,
}: {
  days: AvailabilityDay[];
  selection: Selection | null;
  onSelect: (date: string, startMin: number, price: number) => void;
}) {
  const today = nowNPT().date;
  const dayLabel = (date: string) => {
    if (date === today) return 'Today';
    if (date === addDays(today, 1)) return 'Tmrw';
    return new Date(`${date}T00:00:00Z`).toLocaleDateString('en', {
      weekday: 'short',
      timeZone: 'UTC',
    });
  };

  // roving arrow-key navigation between slot buttons (§3.0 a11y)
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    };
    const move = moves[e.key];
    const target = e.target as HTMLElement;
    if (!move || target.dataset.col === undefined) return;
    e.preventDefault();
    const col = Number(target.dataset.col) + move[0];
    const row = Number(target.dataset.row) + move[1];
    e.currentTarget
      .querySelector<HTMLButtonElement>(`[data-col="${col}"][data-row="${row}"]`)
      ?.focus();
  }

  return (
    <div>
      <div
        role="grid"
        aria-label="Availability for the next 7 days"
        onKeyDown={onKeyDown}
        className="overflow-x-auto rounded-card bg-white p-4"
      >
        <div className="flex gap-2" style={{ minWidth: 560 }}>
          {days.map((day, col) => (
            <div key={day.date} role="row" className="min-w-[72px] flex-1 space-y-1">
              <p className="pb-1 text-center text-xs font-bold uppercase text-sage">
                {dayLabel(day.date)}
                <span className="block font-normal">{day.date.slice(5)}</span>
              </p>
              {day.closed ? (
                <p className="pt-4 text-center text-xs text-sage">Closed</p>
              ) : (
                day.slots.map((slot, row) => {
                  const isSelected =
                    selection?.date === day.date && selection?.startMin === slot.startMin;
                  const label = `${dayLabel(day.date)} ${formatNPT(slot.startMin)}, ${
                    slot.state === 'available' ? `Rs ${slot.price}, available` : slot.state
                  }`;
                  return (
                    <button
                      key={slot.startMin}
                      role="gridcell"
                      data-col={col}
                      data-row={row}
                      aria-label={label}
                      aria-disabled={slot.state !== 'available'}
                      disabled={slot.state === 'past' || slot.state === 'taken'}
                      tabIndex={slot.state === 'available' ? 0 : -1}
                      onClick={() =>
                        slot.state === 'available' &&
                        onSelect(day.date, slot.startMin, slot.price ?? 0)
                      }
                      className={`block w-full rounded-md px-1 py-1.5 text-center text-xs font-semibold transition-colors ${
                        isSelected
                          ? 'bg-accent text-white ring-2 ring-accent-deep'
                          : slot.state === 'available'
                            ? 'bg-mint/30 text-pitch hover:bg-mint/60'
                            : slot.state === 'taken'
                              ? 'bg-ink/10 text-ink/40'
                              : slot.state === 'blocked'
                                ? 'bg-[repeating-linear-gradient(45deg,#e8e8e4,#e8e8e4_4px,#f7f6f2_4px,#f7f6f2_8px)] text-ink/40'
                                : 'bg-transparent text-ink/25' // past
                      }`}
                    >
                      {formatNPT(slot.startMin).replace(':00', '')}
                      {slot.state === 'available' && (
                        <span className="block text-[10px] font-normal">Rs {slot.price}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 flex gap-4 text-xs text-sage" aria-hidden>
        <span>
          <span className="mr-1 inline-block size-3 rounded-sm bg-mint/40 align-middle" />
          available
        </span>
        <span>
          <span className="mr-1 inline-block size-3 rounded-sm bg-ink/10 align-middle" />
          taken
        </span>
        <span>
          <span className="mr-1 inline-block size-3 rounded-sm bg-[repeating-linear-gradient(45deg,#e8e8e4,#e8e8e4_2px,#f7f6f2_2px,#f7f6f2_4px)] align-middle" />
          blocked
        </span>
      </p>
    </div>
  );
}
