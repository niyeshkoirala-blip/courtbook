import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatNPT,
  nowNPT,
  type AvailabilityDay,
  type BookingDto,
  type CourtDto,
  type VenueDto,
} from '@courtbook/shared';
import { api, post, ApiError } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Button, EmptyState, Field, Skeleton } from '../../components/ui';
import { Modal } from '../../components/modal';
import { OwnerNav, VenuePicker, timeOptions, useOwnerVenues } from './common';

/** Owner today view (§3.4, design/09): timeline, stats, walk-in + block actions. */
export function OwnerDashboardPage() {
  const { data: venues, isPending } = useOwnerVenues();
  const [venueId, setVenueId] = useState<string>();
  const venue = venues?.find((v) => v.id === venueId) ?? venues?.[0];

  if (isPending) return <Skeleton className="h-64" />;
  if (!venues?.length) {
    return (
      <EmptyState
        title="Set up your venue"
        body="Add your venue, list a court with its schedule, then publish it for review — takes about 15 minutes."
        cta={
          <Link to="/owner/venues" className="text-sm font-semibold text-pitch underline">
            Add a venue
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl uppercase tracking-wide text-pitch">Today</h1>
        <VenuePicker venues={venues} value={venue!.id} onChange={setVenueId} />
      </div>
      <OwnerNav />
      {venue && <TodayBoard venue={venue} />}
    </div>
  );
}

function TodayBoard({ venue }: { venue: VenueDto }) {
  const today = nowNPT().date;
  const queryClient = useQueryClient();
  const [action, setAction] = useState<'walkin' | 'block' | null>(null);

  const { data: bookings } = useQuery({
    queryKey: ['owner-bookings', venue.id, today],
    queryFn: () => api<BookingDto[]>(`/owner/venues/${venue.id}/bookings`),
    refetchInterval: 60_000,
  });
  const { data: stats } = useQuery({
    queryKey: ['owner-stats', venue.id, today, today],
    queryFn: () =>
      api<{ revenue: number; occupancyPct: number; totalBookings: number }>(
        `/owner/venues/${venue.id}/stats`,
      ),
  });
  const { data: venueDetail } = useQuery({
    queryKey: ['venue', venue.slug],
    queryFn: () => api<{ venue: VenueDto; courts: CourtDto[] }>(`/venues/${venue.slug}`),
  });
  const courts = venueDetail?.courts ?? [];

  const byCourt = new Map<string, BookingDto[]>();
  for (const b of bookings ?? []) {
    const key = b.courtName ?? 'Court';
    byCourt.set(key, [...(byCourt.get(key) ?? []), b]);
  }

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['owner-bookings', venue.id] });
    void queryClient.invalidateQueries({ queryKey: ['owner-stats', venue.id] });
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Bookings today" value={String(stats?.totalBookings ?? '—')} />
        <StatCard label="Revenue today" value={`Rs ${stats?.revenue ?? '—'}`} />
        <StatCard label="Occupancy" value={`${stats?.occupancyPct ?? '—'}%`} />
      </div>

      <div className="flex gap-2">
        <Button onClick={() => setAction('walkin')}>New walk-in</Button>
        <Button variant="secondary" onClick={() => setAction('block')}>
          Block a slot
        </Button>
      </div>

      {byCourt.size === 0 ? (
        <EmptyState
          title="No bookings yet today"
          body="Walk-ins you add will show up here instantly."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...byCourt.entries()].map(([courtName, list]) => (
            <section key={courtName} className="rounded-card bg-white p-5">
              <h2 className="mb-3 font-display uppercase tracking-wide text-pitch">{courtName}</h2>
              <ol className="space-y-2">
                {list.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2 text-sm"
                  >
                    <span className="font-semibold">
                      {formatNPT(b.startMin)}–{formatNPT(b.endMin)}
                    </span>
                    <span className="flex-1 truncate text-sage">
                      {b.customer?.name ?? (b.channel === 'online' ? 'Online booking' : 'Walk-in')}
                      {b.customer?.phone && ` · ${b.customer.phone}`}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        b.status === 'confirmed'
                          ? 'bg-mint/40 text-pitch'
                          : 'bg-accent/15 text-accent-deep'
                      }`}
                    >
                      {b.status.replace('_', ' ')}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      <WalkinModal
        open={action === 'walkin'}
        courts={courts}
        onClose={() => setAction(null)}
        onDone={refresh}
      />
      <BlockModal
        open={action === 'block'}
        courts={courts}
        onClose={() => setAction(null)}
        onDone={refresh}
      />
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-pitch p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-mint/70">{label}</p>
      <p className="mt-1 font-display text-3xl text-paper">{value}</p>
    </div>
  );
}

/** Walk-in modal (§3.4): free slots only — same atomic engine as online bookings. */
function WalkinModal({
  open,
  courts,
  onClose,
  onDone,
}: {
  open: boolean;
  courts: CourtDto[];
  onClose: () => void;
  onDone: () => void;
}) {
  const today = nowNPT().date;
  const [courtId, setCourtId] = useState<string>();
  const [startMin, setStartMin] = useState<number>();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const court = courts.find((c) => c.id === courtId) ?? courts[0];

  const { data: days } = useQuery({
    queryKey: ['availability', court?.id, today],
    queryFn: () => api<AvailabilityDay[]>(`/courts/${court!.id}/availability?from=${today}&days=1`),
    enabled: open && !!court,
  });
  const freeSlots = (days?.[0]?.slots ?? []).filter((s) => s.state === 'available');

  const create = useMutation({
    mutationFn: () =>
      post('/owner/bookings/walkin', {
        courtId: court!.id,
        date: today,
        startMin,
        ...(name && { customer: { name, ...(phone && { phone }) } }),
      }),
    onSuccess: () => {
      toast.success('Walk-in booked');
      onDone();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Walk-in failed'),
  });

  return (
    <Modal open={open} title="New walk-in" onClose={onClose}>
      <div className="space-y-4">
        {courts.length > 1 && (
          <label className="block text-sm font-semibold">
            Court
            <select
              className="mt-1 w-full rounded-lg border border-sage/40 px-3 py-2 text-sm"
              value={court?.id}
              onChange={(e) => setCourtId(e.target.value)}
            >
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm font-semibold">
          Slot (today)
          <select
            className="mt-1 w-full rounded-lg border border-sage/40 px-3 py-2 text-sm"
            value={startMin ?? ''}
            onChange={(e) => setStartMin(Number(e.target.value))}
          >
            <option value="" disabled>
              {freeSlots.length ? 'Pick a free slot' : 'No free slots left today'}
            </option>
            {freeSlots.map((s) => (
              <option key={s.startMin} value={s.startMin}>
                {formatNPT(s.startMin)} — Rs {s.price}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Customer name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Phone (optional)"
          inputMode="numeric"
          placeholder="98XXXXXXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={startMin === undefined}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            Book walk-in
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Block modal (§3.4/§6.4): conflicts return 409 with the clashing bookings. */
function BlockModal({
  open,
  courts,
  onClose,
  onDone,
}: {
  open: boolean;
  courts: CourtDto[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [courtId, setCourtId] = useState<string>();
  const [date, setDate] = useState(nowNPT().date);
  const [startMin, setStartMin] = useState(360);
  const [endMin, setEndMin] = useState(480);
  const [reason, setReason] = useState('');
  const court = courts.find((c) => c.id === courtId) ?? courts[0];

  const create = useMutation({
    mutationFn: () => post('/owner/blocks', { courtId: court!.id, date, startMin, endMin, reason }),
    onSuccess: () => {
      toast.success('Slot blocked');
      onDone();
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'HAS_BOOKINGS') {
        toast.error(
          'Existing bookings overlap that range — resolve them first (§ no silent cancellations)',
        );
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Block failed');
      }
    },
  });

  const timeSelect = (value: number, onChange: (v: number) => void, label: string) => (
    <label className="block text-sm font-semibold">
      {label}
      <select
        className="mt-1 w-full rounded-lg border border-sage/40 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {timeOptions.map((m) => (
          <option key={m} value={m}>
            {formatNPT(m)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Modal open={open} title="Block a slot" onClose={onClose}>
      <div className="space-y-4">
        {courts.length > 1 && (
          <label className="block text-sm font-semibold">
            Court
            <select
              className="mt-1 w-full rounded-lg border border-sage/40 px-3 py-2 text-sm"
              value={court?.id}
              onChange={(e) => setCourtId(e.target.value)}
            >
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          {timeSelect(startMin, setStartMin, 'From')}
          {timeSelect(endMin, setEndMin, 'Until')}
        </div>
        <Field
          label="Reason"
          placeholder="e.g. maintenance"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={reason.length < 2 || endMin <= startMin}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            Block
          </Button>
        </div>
      </div>
    </Modal>
  );
}
