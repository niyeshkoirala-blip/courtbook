import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatNPT, type BookingDto, type PaymentRedirect } from '@courtbook/shared';
import { api, post, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { Button, Skeleton, Spinner } from '../components/ui';

/**
 * Checkout (§3.3, design/04-06): 10-min server-issued countdown, payment
 * method choice, gateway redirect + return-leg relay, confirmed ticket.
 */
export function CheckoutPage() {
  const { bookingId } = useParams();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const relayFired = useRef(false);

  const { data: booking, isPending } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => api<BookingDto>(`/bookings/${bookingId}`),
    refetchInterval: (q) => (q.state.data?.status === 'pending_payment' ? 5000 : false),
  });

  // return leg from a gateway redirect: relay the proof to our callback (§2.16)
  useEffect(() => {
    const gateway = params.get('gateway');
    const data = params.get('data');
    const pidx = params.get('pidx');
    if (relayFired.current || !gateway || params.get('failed')) return;
    if (!(gateway === 'esewa' && data) && !(gateway === 'khalti' && pidx)) return;
    relayFired.current = true;
    setConfirming(true);
    post(`/payments/callback/${gateway}`, gateway === 'esewa' ? { data } : { pidx })
      .catch((err: unknown) => {
        toast.error(err instanceof ApiError ? err.message : 'Payment confirmation failed');
      })
      .finally(() => {
        setConfirming(false);
        setParams({}, { replace: true });
        void queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
      });
  }, [params, bookingId, queryClient, setParams]);

  async function pay(provider: 'esewa' | 'khalti' | 'venue') {
    setPaying(provider);
    try {
      const r = await post<PaymentRedirect>('/payments/initiate', { bookingId, provider });
      if (r.provider === 'venue') {
        void queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
      } else if (r.provider === 'esewa' && r.url && r.fields) {
        submitForm(r.url, r.fields); // browser POSTs the signed form to eSewa
      } else if (r.url) {
        window.location.href = r.url; // Khalti hosted page
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not start payment');
      setPaying(null);
    }
  }

  if (isPending || !booking) return <Skeleton className="h-72 max-w-lg" />;
  if (confirming) return <PollingCard text="Confirming your payment…" />;
  if (booking.status === 'confirmed') return <ConfirmedCard booking={booking} />;
  if (booking.status !== 'pending_payment') return <ExpiredCard booking={booking} />;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="cb-glass rounded-card p-6">
        <h1 className="font-display text-2xl uppercase tracking-wide text-ink">Checkout</h1>
        <p className="mt-2 text-sm text-sage">
          {booking.venueName} · {booking.courtName}
        </p>
        <p className="text-sm">
          <strong>{booking.date}</strong> · {formatNPT(booking.startMin)}–
          {formatNPT(booking.endMin)} · <strong>Rs {booking.price}</strong>
        </p>
        {booking.expiresAt && <Countdown expiresAt={booking.expiresAt} />}
      </div>

      <div className="cb-glass rounded-card p-6">
        <h2 className="mb-3 text-sm font-bold uppercase text-sage">Pay with</h2>
        <div className="space-y-2">
          <Button className="w-full" loading={paying === 'esewa'} onClick={() => pay('esewa')}>
            eSewa
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            loading={paying === 'khalti'}
            onClick={() => pay('khalti')}
          >
            Khalti
          </Button>
          <Button
            className="w-full"
            variant="ghost"
            loading={paying === 'venue'}
            onClick={() => pay('venue')}
          >
            Pay at the venue
          </Button>
        </div>
        <p className="mt-3 text-xs text-sage">
          Sandbox mode — gateway payments use test credentials, no real money moves.
        </p>
      </div>
    </div>
  );
}

/** Server-issued deadline; the client only renders remaining time (§3.3). */
function Countdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  return (
    <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm font-semibold text-accent-deep">
      Slot held for {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      <span className="block text-xs font-normal text-sage">
        Unpaid holds are released after 10 minutes
      </span>
    </p>
  );
}

function ConfirmedCard({ booking }: { booking: BookingDto }) {
  return (
    <div className="cb-glass mx-auto max-w-lg rounded-card p-8 text-center ring-1 ring-turf/30">
      <p className="text-4xl">🎉</p>
      <h1 className="mt-2 font-display text-3xl uppercase tracking-wide text-turf">
        You're booked!
      </h1>
      <p className="mt-2 text-mint">
        {booking.venueName} · {booking.date} · {formatNPT(booking.startMin)}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          to="/me/bookings"
          className="cb-sheen rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-paper shadow-lg shadow-accent/25 hover:bg-accent-deep"
        >
          My bookings
        </Link>
      </div>
    </div>
  );
}

function ExpiredCard({ booking }: { booking: BookingDto }) {
  return (
    <div className="cb-glass mx-auto max-w-lg rounded-card p-8 text-center">
      <h1 className="font-display text-2xl uppercase tracking-wide text-ink">
        {booking.status === 'expired' ? 'Hold expired' : `Booking ${booking.status}`}
      </h1>
      <p className="mt-2 text-sm text-sage">
        {booking.status === 'expired'
          ? 'The 10-minute hold ran out and the slot was released.'
          : 'This booking is no longer payable.'}
      </p>
      <Link to="/venues" className="mt-6 inline-block text-sm font-semibold text-turf underline">
        Find another slot
      </Link>
    </div>
  );
}

function PollingCard({ text }: { text: string }) {
  return (
    <div className="cb-glass mx-auto flex max-w-lg flex-col items-center gap-4 rounded-card p-10">
      <Spinner />
      <p className="text-sm text-sage">{text}</p>
    </div>
  );
}

/** eSewa v2 wants a real form POST — build one and submit it. */
function submitForm(url: string, fields: Record<string, string>) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
