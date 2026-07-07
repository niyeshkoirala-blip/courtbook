import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { VenueDto } from '@courtbook/shared';
import { api } from '../lib/api';
import { EmptyState, Skeleton } from '../components/ui';

/**
 * Venue search (§3.5, design/02): URL-synced filters (shareable links),
 * 300ms debounce, skeleton cards, empty state suggests widening filters.
 */
export function VenuesPage() {
  const [params, setParams] = useSearchParams();
  const urlArea = params.get('area') ?? '';
  const urlPriceMax = params.get('priceMax') ?? '';
  const [area, setArea] = useState(urlArea);
  const [priceMax, setPriceMax] = useState(urlPriceMax);

  // debounce local inputs → URL (the URL is the query key)
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams();
      if (area) next.set('area', area);
      if (priceMax) next.set('priceMax', priceMax);
      if (next.toString() !== params.toString()) setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [area, priceMax, params, setParams]);

  const { data: venues, isPending } = useQuery({
    queryKey: ['venues', urlArea, urlPriceMax],
    queryFn: () => api<VenueDto[]>(`/venues?${params.toString()}`),
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl uppercase tracking-wide text-pitch">Find a court</h1>

      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search by area"
          placeholder="Area, e.g. Baneshwor"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="w-56 rounded-full border border-sage/40 bg-white px-4 py-2 text-sm outline-none focus:border-pitch"
        />
        <input
          aria-label="Max price per hour"
          placeholder="Max Rs / hour"
          inputMode="numeric"
          value={priceMax}
          onChange={(e) => setPriceMax(e.target.value.replace(/\D/g, ''))}
          className="w-40 rounded-full border border-sage/40 bg-white px-4 py-2 text-sm outline-none focus:border-pitch"
        />
      </div>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : !venues?.length ? (
        <EmptyState
          title="No courts found"
          body="Try widening your filters — clear the area or raise the price cap."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((v) => (
            <li key={v.id}>
              <Link
                to={`/venues/${v.slug}`}
                className="block rounded-card bg-white p-5 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent"
              >
                <div className="flex h-28 items-center justify-center rounded-lg bg-pitch/10 font-display text-3xl text-pitch/40">
                  {v.photos[0] ? (
                    <img
                      src={v.photos[0].url}
                      alt=""
                      className="h-full w-full rounded-lg object-cover"
                    />
                  ) : (
                    '⚽'
                  )}
                </div>
                <h2 className="mt-3 font-display text-lg uppercase tracking-wide text-pitch">
                  {v.name}
                </h2>
                <p className="text-sm text-sage">{v.area}</p>
                {v.amenities.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1">
                    {v.amenities.slice(0, 3).map((a) => (
                      <span
                        key={a}
                        className="rounded-full bg-mint/30 px-2 py-0.5 text-xs font-medium text-pitch"
                      >
                        {a.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
