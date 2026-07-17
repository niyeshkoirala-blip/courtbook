import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

/**
 * Landing (§3.5, design/01) — pitch-green hero with floodlight glow, a
 * three-step "how it works", a live availability strip, and an owner CTA.
 * Sections rise into view on scroll via a single IntersectionObserver.
 */
export function LandingPage() {
  const rootRef = useReveal();

  return (
    <div ref={rootRef} className="space-y-12">
      <Hero />
      <HowItWorks />
      <LiveStrip />
      <OwnerCta />
    </div>
  );
}

/** Adds `.is-in` to every `.cb-reveal` inside as it scrolls into view. */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const targets = root.querySelectorAll('.cb-reveal');
    // No IntersectionObserver (or reduced-motion prefs) → just show everything.
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            obs.unobserve(e.target); // reveal once, then stop watching
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

/** Small orange dot that pulses to signal "live". */
function LiveDot({ className = '' }: { className?: string }) {
  return <span className={`cb-pulse inline-block rounded-full bg-accent ${className}`} />;
}

function Hero() {
  return (
    <section className="cb-reveal relative overflow-hidden rounded-card bg-pitch px-6 py-16 sm:py-24">
      {/* floodlight glow */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(191,216,206,.18), rgba(191,216,206,0) 65%)',
        }}
      />
      {/* faint court markings */}
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute inset-x-12 bottom-24 h-0.5 bg-paper/10" />
        <div className="absolute bottom-6 left-1/2 size-52 -translate-x-1/2 rounded-full border-2 border-paper/10" />
      </div>
      <div className="absolute -bottom-24 -left-24 size-56 rounded-full border-2 border-paper/20" />

      <div className="relative mx-auto max-w-3xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-mint">
          <LiveDot className="size-2" />
          Kathmandu Futsal
        </div>
        <h1 className="mx-auto max-w-2xl font-display text-4xl uppercase leading-[0.95] tracking-wide text-paper sm:text-6xl">
          Your court. Your time.
          <br />
          <span className="text-accent">Booked in 30 seconds.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-mint/90">
          See live availability at futsal courts across Kathmandu — no more calling five venues.
          Pick a slot, pay with eSewa or Khalti, play.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/venues"
            className="inline-block rounded-full bg-accent px-8 py-3 font-semibold text-white shadow-lg shadow-accent/25 transition-transform hover:scale-105 hover:bg-accent-deep active:scale-95"
          >
            Find a court
          </Link>
          <a
            href="#how"
            className="inline-block rounded-full border border-mint/30 px-8 py-3 font-semibold text-mint transition-colors hover:border-mint hover:bg-paper/5"
          >
            How it works
          </a>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  ['01', 'Find', 'Pick your area and time. See every free court nearby with live prices.', false],
  ['02', 'Book', 'Tap your slot and confirm. Your court is locked in — no phone tag.', false],
  ['03', 'Play', "Show up under the floodlights. Your squad's already in the group chat.", true],
] as const;

function HowItWorks() {
  return (
    <section id="how" className="cb-reveal">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">How it works</p>
      <h2 className="mt-2 font-display text-3xl uppercase tracking-wide text-ink sm:text-4xl">
        From “let’s play” to on the turf
      </h2>
      <div className="relative mt-12">
        {/* horizontal court line linking the steps (desktop only) */}
        <div className="absolute inset-x-0 top-9 hidden h-0.5 bg-pitch/80 sm:block" />
        <div className="relative grid gap-8 sm:grid-cols-3">
          {STEPS.map(([n, title, body, accent]) => (
            <div key={n} className="rounded-card bg-white p-6">
              <div
                className={`flex size-16 items-center justify-center rounded-full font-display text-2xl text-paper ${
                  accent ? 'bg-accent' : 'bg-pitch'
                }`}
              >
                {n}
              </div>
              <h3 className="mt-6 font-display text-xl uppercase tracking-wide text-pitch">
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

// Availability mock — 'free' (orange, tap to book), 'open' (grey), 'booked' (dark).
type Cell = 'free' | 'open' | 'booked';
const SLOTS = ['6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM'] as const;
const COURTS: { name: string; cells: Cell[] }[] = [
  { name: 'Futsal Arena', cells: ['open', 'free', 'open', 'free', 'open', 'booked'] },
  { name: 'Goal Zone Kupondole', cells: ['booked', 'booked', 'free', 'open', 'free', 'open'] },
  { name: 'The Pitch · Kupondole', cells: ['open', 'open', 'booked', 'free', 'open', 'open'] },
];
const CELL_CLASS: Record<Cell, string> = {
  free: 'bg-accent',
  open: 'bg-mint/40',
  booked: 'bg-pitch/20',
};

function LiveStrip() {
  return (
    <section className="cb-reveal">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-pitch">
            <LiveDot className="size-1.5" />
            Live right now
          </p>
          <h2 className="mt-2 font-display text-2xl uppercase tracking-wide text-ink sm:text-3xl">
            Tonight in Kupondole
          </h2>
        </div>
        <Link to="/venues" className="text-sm font-semibold text-pitch hover:text-accent">
          See all courts →
        </Link>
      </div>

      <div className="overflow-x-auto rounded-card bg-white p-5 shadow-sm sm:p-6">
        <div className="min-w-[520px]">
          {/* header row */}
          <div className="grid grid-cols-[10rem_repeat(6,1fr)] items-center gap-2">
            <div />
            {SLOTS.map((s) => (
              <div key={s} className="text-center text-xs font-semibold tabular-nums text-sage">
                {s}
              </div>
            ))}
          </div>
          {/* court rows */}
          {COURTS.map((court, r) => (
            <div
              key={court.name}
              className="mt-2 grid grid-cols-[10rem_repeat(6,1fr)] items-center gap-2"
            >
              <div className="truncate pr-2 text-sm font-semibold text-ink">{court.name}</div>
              {court.cells.map((cell, c) => (
                <div
                  key={c}
                  title={cell === 'free' ? 'Free — tap to book' : cell === 'open' ? 'Available' : 'Booked'}
                  className={`cb-bar h-10 rounded-lg ${CELL_CLASS[cell]} ${
                    cell === 'free' ? 'cursor-pointer transition-transform hover:scale-105' : ''
                  }`}
                  style={{ animationDelay: `${(r * SLOTS.length + c) * 35}ms` }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* legend */}
        <div className="mt-6 flex flex-wrap gap-5 border-t border-paper pt-5">
          <Legend swatch="bg-accent" label="Free — tap to book" />
          <Legend swatch="bg-mint/40" label="Available" />
          <Legend swatch="bg-pitch/20" label="Booked" />
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

const OWNER_STATS = [
  ['9', 'Bookings', 'text-paper'],
  ['2', 'Free slots', 'text-accent'],
  ['13.5k', 'Rs today', 'text-paper'],
] as const;

function OwnerCta() {
  return (
    <section className="cb-reveal relative overflow-hidden rounded-card bg-pitch px-6 py-12 sm:px-10 sm:py-16">
      <div className="absolute -right-20 -top-20 size-48 rounded-full border-2 border-paper/20" />
      <div className="relative grid items-center gap-10 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mint">
            For court owners
          </p>
          <h2 className="mt-4 font-display text-3xl uppercase leading-[0.98] tracking-wide text-paper sm:text-4xl">
            Run your court from your pocket
          </h2>
          <p className="mt-4 max-w-md text-mint/90">
            Fill empty slots, take bookings 24/7, and stop juggling calls during a match. See every
            booking on one screen.
          </p>
          <Link
            to="/auth/register"
            className="mt-8 inline-block rounded-full border border-mint/40 px-8 py-3 font-semibold text-paper transition-colors hover:border-mint hover:bg-paper/5"
          >
            List your venue
          </Link>
        </div>

        {/* owner dashboard mock */}
        <div className="rounded-card border border-mint/20 bg-pitch-deep p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-display text-lg uppercase tracking-wide text-paper">Today</span>
            <span className="text-xs text-mint/80">Futsal Arena · Kupondole</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {OWNER_STATS.map(([value, label, color]) => (
              <div key={label} className="rounded-lg bg-pitch p-4">
                <div className={`font-display text-2xl ${color}`}>{value}</div>
                <div className="mt-1 text-[11px] tracking-wide text-mint/80">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2.5">
            <div className="flex items-center justify-between rounded-lg bg-pitch px-4 py-3">
              <span className="flex items-center gap-3 text-sm font-medium text-paper">
                <span className="size-2 rounded-full bg-accent" />
                7:00 PM · 5-a-side
              </span>
              <span className="text-sm tabular-nums text-mint/80">Rs 1,500</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-pitch px-4 py-3">
              <span className="flex items-center gap-3 text-sm font-medium text-paper">
                <span className="size-2 rounded-full bg-mint" />
                8:00 PM · Free
              </span>
              <span className="text-sm text-mint/80">Open</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
