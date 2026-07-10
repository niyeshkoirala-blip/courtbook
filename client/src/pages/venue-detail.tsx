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
  courtName: string;
  date: string;
  startMin: number;
  price: number;
}

const SELECTION_KEY = 'courtbook:pending-selection';
const selKey = (s: { courtId: string; date: string; startMin: number }) =>
  `${s.courtId}:${s.date}:${s.startMin}`;

export function VenueDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [courtId, setCourtId] = useState<string>();
  // multi-select: several slots (across courts) can be held then booked together
  const [selections, setSelections] = useState<Selection[]>([]);
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

  // restore selections stashed before a login redirect (§3.2)
  useEffect(() => {
    const raw = sessionStorage.getItem(SELECTION_KEY);
    if (raw && user && data) {
      sessionStorage.removeItem(SELECTION_KEY);
      setSelections(JSON.parse(raw) as Selection[]);
    }
  }, [user, data]);

  function toggle(slot: { date: string; startMin: number; price: number }) {
    if (!court) return;
    const next: Selection = {
      courtId: court.id,
      courtName: court.name,
      date: slot.date,
      startMin: slot.startMin,
      price: slot.price,
    };
    setSelections((cur) =>
      cur.some((s) => selKey(s) === selKey(next))
        ? cur.filter((s) => selKey(s) !== selKey(next))
        : [...cur, next],
    );
  }

  const total = selections.reduce((sum, s) => sum + s.price, 0);

  async function book() {
    if (selections.length === 0) return;
    if (!user) {
      sessionStorage.setItem(SELECTION_KEY, JSON.stringify(selections));
      navigate(`/auth/login?next=${encodeURIComponent(`/venues/${slug}`)}`);
      return;
    }
    setBooking(true);
    const bookedIds: string[] = [];
    let taken = 0;
    let stopMsg: string | null = null; // hold-cap or rate-limit — stop and inform
    try {
      for (const s of selections) {
        try {
          const created = await post<{ id: string }>('/bookings', {
            courtId: s.courtId,
            date: s.date,
            startMin: s.startMin,
            idempotencyKey: crypto.randomUUID(), // network-retry-proof (§4.5)
          });
          bookedIds.push(created.id);
        } catch (err) {
          if (err instanceof ApiError && err.code === 'SLOT_TAKEN') taken += 1;
          else if (
            err instanceof ApiError &&
            (err.code === 'TOO_MANY_HOLDS' || err.code === 'RATE_LIMITED')
          ) {
            stopMsg = err.message; // no point trying the rest
            break;
          } else throw err;
        }
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Booking failed — try again');
      setBooking(false);
      void refetch();
      return;
    }
    setBooking(false);
    void refetch();

    // single-slot → straight to checkout (unchanged smooth path)
    if (selections.length === 1 && bookedIds.length === 1) {
      navigate(`/book/${bookedIds[0]}`);
      return;
    }
    if (taken > 0) toast.error(`${taken} slot${taken > 1 ? 's were' : ' was'} just taken.`);
    if (stopMsg) toast.error(stopMsg);
    if (bookedIds.length > 0) {
      toast.success(
        `Booked ${bookedIds.length} slot${bookedIds.length > 1 ? 's' : ''} — pay for each in My Bookings.`,
      );
      setSelections([]);
      navigate('/me/bookings');
    }
  }

  if (isPending) return <Skeleton className="h-96" />;
  if (!data) return null;

  // keys of the currently-viewed court's selections, for the ring highlight
  const selectedKeys = new Set(
    selections.filter((s) => s.courtId === court?.id).map((s) => `${s.date}:${s.startMin}`),
  );

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
        <p className="mt-2 text-xs text-sage">
          Tap slots to select — you can pick several and book them together.
        </p>
      </header>

      {data.courts.length > 1 && (
        <div role="tablist" aria-label="Courts" className="flex gap-2">
          {data.courts.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === court?.id}
              onClick={() => setCourtId(c.id)} // selections persist across courts
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
        <AvailabilityGrid days={days} selectedKeys={selectedKeys} onToggle={toggle} />
      )}

      {/* sticky booking bar (§3.2) */}
      {selections.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-pitch/10 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="text-sm">
              <strong className="font-display uppercase text-pitch">
                {selections.length} slot{selections.length > 1 ? 's' : ''}
              </strong>{' '}
              selected · total <strong>Rs {total}</strong>
              <button
                onClick={() => setSelections([])}
                className="ml-3 text-xs text-sage underline hover:text-pitch"
              >
                clear
              </button>
            </div>
            <Button onClick={book} loading={booking} size="lg">
              {selections.length > 1 ? `Book ${selections.length} slots` : 'Book this slot'}
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
 * Multi-select: `selectedKeys` are the "date:startMin" of ringed cells.
 */
function AvailabilityGrid({
  days,
  selectedKeys,
  onToggle,
}: {
  days: AvailabilityDay[];
  selectedKeys: Set<string>;
  onToggle: (slot: { date: string; startMin: number; price: number }) => void;
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
                  const isSelected = selectedKeys.has(`${day.date}:${slot.startMin}`);
                  const label = `${dayLabel(day.date)} ${formatNPT(slot.startMin)}, ${
                    slot.state === 'available'
                      ? `Rs ${slot.price}, available${isSelected ? ', selected' : ''}`
                      : slot.state
                  }`;
                  return (
                    <button
                      key={slot.startMin}
                      role="gridcell"
                      data-col={col}
                      data-row={row}
                      aria-label={label}
                      aria-pressed={slot.state === 'available' ? isSelected : undefined}
                      aria-disabled={slot.state !== 'available'}
                      disabled={slot.state === 'past' || slot.state === 'taken'}
                      tabIndex={slot.state === 'available' ? 0 : -1}
                      onClick={() =>
                        slot.state === 'available' &&
                        onToggle({
                          date: day.date,
                          startMin: slot.startMin,
                          price: slot.price ?? 0,
                        })
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
      <p className="mt-2 flex flex-wrap gap-4 text-xs text-sage" aria-hidden>
        <span>
          <span className="mr-1 inline-block size-3 rounded-sm bg-mint/40 align-middle" />
          available
        </span>
        <span>
          <span className="mr-1 inline-block size-3 rounded-sm bg-accent align-middle" />
          selected
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
