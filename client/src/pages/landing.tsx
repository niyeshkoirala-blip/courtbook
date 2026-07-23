import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { HomeSummaryDto } from '@courtbook/shared';
import { api } from '../lib/api';
import { useReveal, useSpotlight } from '../components/fx';

/**
 * Landing — the "night match" showcase. The 3D court background is global
 * (layout mounts <Bg3d/>); this page layers a staggered hero, count-up
 * stats, a live availability grid, and a floating owner-dashboard mock on
 * top of it. All entrance motion runs through the shared useReveal hook.
 */
export function LandingPage() {
  const rootRef = useReveal();
  useSpotlight(rootRef); // cursor-follow highlight on every .cb-spot card below
  // Public landing summary — real counts + live availability from the DB.
  const { data } = useQuery({
    queryKey: ['home-summary'],
    queryFn: () => api<HomeSummaryDto>('/home'),
  });

  return (
    <div ref={rootRef} className="space-y-24 sm:space-y-32">
      <Hero summary={data} />
      <HowItWorks />
      <LiveStrip tonight={data?.tonight} />
      <OwnerCta owner={data?.owner} />
    </div>
  );
}

/** Small turf dot that pulses to signal "live". */
function LiveDot({ className = '' }: { className?: string }) {
  return <span className={`cb-pulse inline-block rounded-full bg-turf ${className}`} />;
}

/** Counts from 0 to `to` over ~1s once the element scrolls into view. */
function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(to);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry], obs) => {
        if (!entry?.isIntersecting) return;
        obs.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / 1000, 1);
          setValue(Math.round(to * (1 - Math.pow(1 - t, 3)))); // ease-out cubic
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to]);
  return (
    <span ref={ref} className="tabular-nums">
      {value}
      {suffix}
    </span>
  );
}

function Hero({ summary }: { summary?: HomeSummaryDto | undefined }) {
  // Counts come from the DB; "30s to confirm" is a product claim, not data.
  const heroStats: readonly [number, string, string][] = [
    [summary?.stats.courts ?? 0, '+', 'Courts listed'],
    [summary?.stats.bookings ?? 0, '+', 'Matches booked'],
    [30, 's', 'To confirm'],
  ];
  // Left chip = a real venue with free time today; right chip = a real booking.
  const freeChip = (() => {
    const labels = summary?.tonight.labels ?? [];
    for (const c of summary?.tonight.courts ?? []) {
      const idx = c.cells.findIndex((x) => x !== 'booked');
      if (idx >= 0) {
        return {
          venue: c.venueName,
          label: labels[idx],
          count: c.cells.filter((x) => x !== 'booked').length,
        };
      }
    }
    return null;
  })();
  const recent = summary?.recentBooking ?? null;
  return (
    <section className="relative pt-10 sm:pt-20">
      <div className="mx-auto max-w-3xl text-center">
        <div
          className="cb-reveal mb-6 inline-flex items-center gap-2 rounded-full border border-turf/25 bg-turf/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-turf"
          style={{ animationDelay: '0ms' }}
        >
          <LiveDot className="size-2" />
          Live in Kathmandu
        </div>
        <h1 className="font-display text-5xl font-bold leading-[1.02] tracking-tight text-ink sm:text-7xl">
          <span className="cb-reveal block" style={{ animationDelay: '100ms' }}>
            Your court. Your time.
          </span>
          <span className="cb-reveal cb-gradient-text block" style={{ animationDelay: '250ms' }}>
            Booked in 30 seconds.
          </span>
        </h1>
        <p
          className="cb-reveal mx-auto mt-6 max-w-xl text-lg text-sage"
          style={{ animationDelay: '400ms' }}
        >
          See live availability at futsal courts across Kathmandu — no more calling five venues.
          Pick a slot, pay with eSewa or Khalti, play.
        </p>
        <div
          className="cb-reveal mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: '550ms' }}
        >
          <Link
            to="/venues"
            className="cb-sheen group inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3.5 font-bold text-paper shadow-xl shadow-accent/30 transition-all hover:scale-[1.04] hover:bg-accent-deep hover:shadow-accent/50 active:scale-95"
          >
            Find a court
            <span aria-hidden className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
          <a
            href="#how"
            className="cb-glass inline-block rounded-full px-8 py-3.5 font-semibold text-mint transition-colors hover:border-turf/40 hover:text-turf"
          >
            How it works
          </a>
        </div>

        {/* proof stats */}
        <dl
          className="cb-reveal mx-auto mt-14 grid max-w-lg grid-cols-3 gap-4"
          style={{ animationDelay: '700ms' }}
        >
          {heroStats.map(([n, suffix, label]) => (
            <div key={label} className="cb-spot cb-glass rounded-card px-3 py-4">
              <dt className="sr-only">{label}</dt>
              <dd className="font-display text-2xl font-bold text-turf sm:text-3xl">
                <CountUp to={n} suffix={suffix} />
              </dd>
              <dd className="mt-1 text-[11px] font-medium uppercase tracking-wider text-sage">
                {label}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* floating slot chips — real data, depth props over the 3D floor */}
      {freeChip && (
        <div
          aria-hidden
          className="cb-float pointer-events-none absolute left-[4%] top-24 hidden rotate-[-6deg] lg:block"
        >
          <div className="cb-glass rounded-card px-4 py-3 text-left shadow-2xl">
            <p className="text-[10px] uppercase tracking-wider text-sage">
              Today · {freeChip.label}
            </p>
            <p className="mt-0.5 text-sm font-bold text-ink">{freeChip.venue}</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-turf">
              <LiveDot className="size-1.5" /> {freeChip.count} slot
              {freeChip.count === 1 ? '' : 's'} free
            </p>
          </div>
        </div>
      )}
      {recent && (
        <div
          aria-hidden
          className="cb-float pointer-events-none absolute right-[3%] top-[26rem] hidden rotate-[5deg] lg:block"
          style={{ animationDelay: '-3.5s' }}
        >
          <div className="cb-glass rounded-card px-4 py-3 text-left shadow-2xl">
            <p className="text-[10px] uppercase tracking-wider text-sage">Booked ✓</p>
            <p className="mt-0.5 text-sm font-bold text-ink">
              {recent.venueName} · {recent.label}
            </p>
            <p className="mt-1 text-xs font-semibold text-accent">
              Rs {recent.price.toLocaleString()} · paid
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

const STEPS = [
  ['01', 'Find', 'Pick your area and time. See every free court nearby with live prices.'],
  ['02', 'Book', 'Tap your slot and confirm. Your court is locked in — no phone tag.'],
  ['03', 'Play', "Show up under the floodlights. Your squad's already in the group chat."],
] as const;

function HowItWorks() {
  return (
    <section id="how" className="cb-reveal scroll-mt-24">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-turf">How it works</p>
      <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        From “let’s play” to on the turf
      </h2>
      <div className="relative mt-12">
        {/* faint court line linking the steps (desktop only) */}
        <div className="absolute inset-x-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-turf/30 to-transparent sm:block" />
        <div className="relative grid gap-6 sm:grid-cols-3">
          {STEPS.map(([n, title, body], i) => (
            <div
              key={n}
              className="cb-reveal cb-spot cb-glass cb-lift rounded-card p-6"
              style={{ animationDelay: `${i * 140}ms` }}
            >
              <div
                className={`flex size-16 items-center justify-center rounded-full font-display text-2xl font-bold ${
                  i === STEPS.length - 1
                    ? 'bg-accent text-paper shadow-lg shadow-accent/30'
                    : 'bg-turf/15 text-turf ring-1 ring-turf/30'
                }`}
              >
                {n}
              </div>
              <h3 className="mt-6 font-display text-xl font-bold uppercase tracking-wide text-ink">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-sage">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Availability states — 'free' (turf, next open slot), 'open' (mint, also free), 'booked' (dim).
type Cell = 'free' | 'open' | 'booked';
const CELL_CLASS: Record<Cell, string> = {
  free: 'bg-turf shadow-lg shadow-turf/30',
  open: 'bg-mint/15 ring-1 ring-inset ring-mint/20',
  booked: 'bg-white/4',
};

function LiveStrip({ tonight }: { tonight?: HomeSummaryDto['tonight'] | undefined }) {
  const labels = tonight?.labels ?? [];
  const courts = tonight?.courts ?? [];
  // Nothing approved / nothing to show yet → hide the section rather than fake it.
  if (tonight && courts.length === 0) return null;
  return (
    <section className="cb-reveal">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-turf">
            <LiveDot className="size-1.5" />
            Live right now
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Available in the next few hours
          </h2>
        </div>
        <Link
          to="/venues"
          className="group text-sm font-semibold text-mint transition-colors hover:text-turf"
        >
          See all courts{' '}
          <span aria-hidden className="inline-block transition-transform group-hover:translate-x-1">
            →
          </span>
        </Link>
      </div>

      <div className="cb-glass overflow-x-auto rounded-card p-5 sm:p-6">
        <div className="min-w-[520px]">
          {/* header row — server sends 6 hourly columns */}
          <div className="grid grid-cols-[10rem_repeat(6,1fr)] items-center gap-2">
            <div />
            {labels.map((s) => (
              <div key={s} className="text-center text-xs font-semibold tabular-nums text-sage">
                {s}
              </div>
            ))}
          </div>
          {/* court rows */}
          {courts.map((court, r) => (
            <div
              key={court.venueName + court.area}
              className="mt-2 grid grid-cols-[10rem_repeat(6,1fr)] items-center gap-2"
            >
              <div className="truncate pr-2 text-sm font-semibold text-ink">
                {court.venueName}
                <span className="ml-1 font-normal text-sage">· {court.area}</span>
              </div>
              {court.cells.map((cell, c) => (
                <div
                  key={c}
                  title={
                    cell === 'free'
                      ? 'Free — tap to book'
                      : cell === 'open'
                        ? 'Available'
                        : 'Booked'
                  }
                  className={`cb-bar h-10 rounded-lg ${CELL_CLASS[cell]} ${
                    cell === 'free'
                      ? 'cursor-pointer transition-transform hover:scale-105 hover:shadow-turf/50'
                      : ''
                  }`}
                  style={{ animationDelay: `${(r * 6 + c) * 35}ms` }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* legend */}
        <div className="mt-6 flex flex-wrap gap-5 border-t border-white/5 pt-5">
          <Legend swatch="bg-turf" label="Free — tap to book" />
          <Legend swatch="bg-mint/15 ring-1 ring-mint/20" label="Available" />
          <Legend swatch="bg-white/4" label="Booked" />
        </div>
      </div>
    </section>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-sage">
      <span className={`size-3.5 rounded ${swatch}`} />
      {label}
    </span>
  );
}

/** 8000 → "8k", 13500 → "13.5k" — compact Rs for the tight stat cards. */
function compactRs(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n);
}

function OwnerCta({ owner }: { owner?: HomeSummaryDto['owner'] | undefined }) {
  // Live snapshot of the top-earning venue; falls back to zeros before load.
  const ownerStats: readonly [string, string, string][] = [
    [String(owner?.bookings ?? 0), 'Bookings', 'text-ink'],
    [String(owner?.freeToday ?? 0), 'Free today', 'text-turf'],
    [compactRs(owner?.earnings ?? 0), 'Rs earned', 'text-accent'],
  ];
  const slots = owner?.slots ?? [];
  return (
    <section className="cb-reveal relative overflow-hidden rounded-card border border-white/8 bg-pitch px-6 py-12 sm:px-10 sm:py-16">
      {/* decorative slow-spinning court ring */}
      <div
        aria-hidden
        className="cb-spin-slow absolute -right-24 -top-24 size-64 rounded-full border border-dashed border-turf/20"
      />
      <div
        aria-hidden
        className="absolute -bottom-32 -left-16 size-72 rounded-full bg-turf/8"
        style={{ filter: 'blur(70px)' }}
      />
      <div className="relative grid items-center gap-10 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-turf">
            For court owners
          </p>
          <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            Run your court from your pocket
          </h2>
          <p className="mt-4 max-w-md text-sage">
            Fill empty slots, take bookings 24/7, and stop juggling calls during a match. See every
            booking on one screen.
          </p>
          <Link
            to="/auth/register"
            className="cb-glass mt-8 inline-block rounded-full px-8 py-3 font-semibold text-mint transition-colors hover:border-turf/40 hover:text-turf"
          >
            List your venue
          </Link>
        </div>

        {/* owner dashboard mock — floats gently over the pitch */}
        <div className="cb-float cb-glass rounded-card p-5" style={{ animationDelay: '-2s' }}>
          <div className="mb-4 flex items-center justify-between">
            <span className="font-display text-lg font-bold uppercase tracking-wide text-ink">
              Top earner
            </span>
            <span className="text-xs text-sage">
              {owner ? `${owner.venueName} · ${owner.area}` : 'Your venue'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {ownerStats.map(([value, label, color]) => (
              <div key={label} className="rounded-lg bg-paper/60 p-4 ring-1 ring-white/5">
                <div className={`font-display text-2xl font-bold ${color}`}>{value}</div>
                <div className="mt-1 text-[11px] tracking-wide text-sage">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2.5">
            {slots.length === 0 ? (
              <div className="rounded-lg bg-paper/60 px-4 py-3 text-sm text-sage ring-1 ring-white/5">
                No more slots today
              </div>
            ) : (
              slots.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between rounded-lg bg-paper/60 px-4 py-3 ring-1 ring-white/5"
                >
                  <span className="flex items-center gap-3 text-sm font-medium text-ink">
                    {s.available ? (
                      <LiveDot className="size-2" />
                    ) : (
                      <span className="size-2 rounded-full bg-accent" />
                    )}
                    {s.label}
                  </span>
                  {s.available ? (
                    <span className="text-sm font-semibold text-turf">
                      Rs {s.price.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-sm tabular-nums text-sage">Booked</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
