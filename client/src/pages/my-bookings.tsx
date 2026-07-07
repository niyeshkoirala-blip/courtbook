import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatNPT, nowNPT, slotStartUtc, type BookingDto } from '@courtbook/shared';
import { api, post, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { Button, EmptyState, Skeleton } from '../components/ui';
import { Modal } from '../components/modal';

/** My bookings (§3.5, design/04-06): tabs, cancel with policy modal, .ics. */

const TABS = ['Upcoming', 'Past', 'Cancelled'] as const;
type Tab = (typeof TABS)[number];

export function MyBookingsPage() {
  const [tab, setTab] = useState<Tab>('Upcoming');
  const [cancelTarget, setCancelTarget] = useState<BookingDto | null>(null);
  const queryClient = useQueryClient();

  const { data: bookings, isPending } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => api<BookingDto[]>('/me/bookings?limit=50'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => post<BookingDto>(`/bookings/${id}/cancel`),
    onSuccess: (b) => {
      toast.success(`Booking cancelled — ${b.cancellation?.refundPct ?? 0}% refund`);
      setCancelTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Cancellation failed'),
  });

  const today = nowNPT().date;
  const visible = (bookings ?? []).filter((b) => {
    const upcoming =
      (b.status === 'confirmed' || b.status === 'pending_payment') && b.date >= today;
    if (tab === 'Upcoming') return upcoming;
    if (tab === 'Cancelled') return b.status === 'cancelled' || b.status === 'expired';
    return !upcoming && b.status !== 'cancelled' && b.status !== 'expired';
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl uppercase tracking-wide text-pitch">My bookings</h1>

      <div role="tablist" aria-label="Booking status" className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={t === tab}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              t === tab ? 'bg-pitch text-mint' : 'bg-white text-pitch hover:bg-pitch/10'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {isPending ? (
        <Skeleton className="h-48" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={`No ${tab.toLowerCase()} bookings`}
          body="Grab a slot while the evening ones are still free."
          cta={
            <Link to="/venues" className="text-sm font-semibold text-pitch underline">
              Find a court
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-white p-5"
            >
              <div>
                <p className="font-display uppercase tracking-wide text-pitch">
                  {b.venueName ?? 'Venue'} · {b.courtName ?? 'Court'}
                </p>
                <p className="text-sm text-sage">
                  {b.date} · {formatNPT(b.startMin)}–{formatNPT(b.endMin)} · Rs {b.price}
                </p>
                <p className="mt-1">
                  <StatusBadge status={b.status} />
                  {b.cancellation && (
                    <span className="ml-2 text-xs text-sage">
                      refund {b.cancellation.refundPct}%
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                {b.status === 'pending_payment' && (
                  <Link to={`/book/${b.id}`}>
                    <Button size="sm">Pay now</Button>
                  </Link>
                )}
                {b.status === 'confirmed' && (
                  <Button size="sm" variant="ghost" onClick={() => downloadIcs(b)}>
                    Add to calendar
                  </Button>
                )}
                {(b.status === 'confirmed' || b.status === 'pending_payment') && (
                  <Button size="sm" variant="danger" onClick={() => setCancelTarget(b)}>
                    Cancel
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!cancelTarget} title="Cancel booking?" onClose={() => setCancelTarget(null)}>
        {cancelTarget && (
          <>
            <p className="text-sm">
              {cancelTarget.venueName} · {cancelTarget.date} {formatNPT(cancelTarget.startMin)}
            </p>
            {/* §7.4 policy — the server computes the actual refund on cancel */}
            <div className="mt-4 rounded-lg bg-paper p-3 text-xs text-sage">
              <p className="mb-1 font-bold uppercase">Refund policy</p>
              <p>More than 24h before the slot — 100%</p>
              <p>6–24h before — 50%</p>
              <p>Under 6h — no refund (slot still reopens)</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCancelTarget(null)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                loading={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(cancelTarget.id)}
              >
                Cancel booking
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function StatusBadge({ status }: { status: BookingDto['status'] }) {
  const styles: Record<string, string> = {
    confirmed: 'bg-mint/40 text-pitch',
    pending_payment: 'bg-accent/15 text-accent-deep',
    completed: 'bg-ink/10 text-ink',
    cancelled: 'bg-danger/10 text-danger',
    expired: 'bg-ink/10 text-ink/50',
    no_show: 'bg-danger/10 text-danger',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status] ?? ''}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

/** .ics download (§3.5) — times converted from NPT minutes to UTC instants. */
function downloadIcs(b: BookingDto) {
  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CourtBook//EN',
    'BEGIN:VEVENT',
    `UID:${b.id}@courtbook`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(slotStartUtc(b.date, b.startMin))}`,
    `DTEND:${fmt(slotStartUtc(b.date, b.endMin))}`,
    `SUMMARY:Futsal — ${b.venueName ?? 'CourtBook'} (${b.courtName ?? 'court'})`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `courtbook-${b.date}.ics`,
  });
  a.click();
  URL.revokeObjectURL(url);
}
