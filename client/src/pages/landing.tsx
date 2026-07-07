import { Link } from 'react-router-dom';

/** Landing (§3.5, design/01) — hero on pitch green, orange CTA. */
export function LandingPage() {
  return (
    <div className="space-y-12">
      <section className="rounded-card bg-pitch px-6 py-16 text-center sm:py-24">
        <h1 className="mx-auto max-w-2xl font-display text-4xl uppercase leading-tight tracking-wide text-paper sm:text-6xl">
          Book your futsal court <span className="text-accent">in seconds</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-mint/90">
          Live availability across Kathmandu. Pick a slot, pay with eSewa or Khalti, play.
        </p>
        <Link
          to="/venues"
          className="mt-8 inline-block rounded-full bg-accent px-8 py-3 font-semibold text-white transition-colors hover:bg-accent-deep"
        >
          Find a court
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          [
            'See real availability',
            'No more calling five venues — the grid shows every free slot, live.',
          ],
          [
            'Instant confirmation',
            'Your slot is locked the moment you book. Zero double bookings.',
          ],
          ['Pay your way', 'eSewa, Khalti, or pay at the venue where accepted.'],
        ].map(([title, body]) => (
          <div key={title} className="rounded-card bg-white p-6">
            <h2 className="font-display text-lg uppercase tracking-wide text-pitch">{title}</h2>
            <p className="mt-2 text-sm text-sage">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
