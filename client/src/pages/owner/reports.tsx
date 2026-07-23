import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, nowNPT } from '@courtbook/shared';
import { api } from '../../lib/api';
import { Button, Skeleton } from '../../components/ui';
import { OwnerNav, VenuePicker, useOwnerVenues } from './common';

interface Stats {
  totalBookings: number;
  revenue: number;
  occupancyPct: number;
  perDay: { date: string; bookings: number; revenue: number }[];
}

/** Owner reports (§3.5, design/12): range stats + CSV export (client-side). */
export function OwnerReportsPage() {
  const { data: venues, isPending } = useOwnerVenues();
  const [venueId, setVenueId] = useState<string>();
  const venue = venues?.find((v) => v.id === venueId) ?? venues?.[0];
  const today = nowNPT().date;
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);

  const { data: stats } = useQuery({
    queryKey: ['owner-stats', venue?.id, from, to],
    queryFn: () => api<Stats>(`/owner/venues/${venue!.id}/stats?from=${from}&to=${to}`),
    enabled: !!venue && from <= to,
  });

  function exportCsv() {
    if (!stats || !venue) return;
    const rows = [
      'date,bookings,revenue_npr',
      ...stats.perDay.map((d) => `${d.date},${d.bookings},${d.revenue}`),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([rows], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `courtbook-${venue.slug}-${from}-${to}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  const maxRevenue = Math.max(1, ...(stats?.perDay.map((d) => d.revenue) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl uppercase tracking-wide text-ink">Reports</h1>
        {venues && venue && <VenuePicker venues={venues} value={venue.id} onChange={setVenueId} />}
      </div>
      <OwnerNav />

      {isPending ? (
        <Skeleton className="h-64" />
      ) : !venue ? (
        <p className="text-sage">Add a venue first.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold">
              From
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="text-sm font-semibold">
              To
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 block rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-ink"
              />
            </label>
            <Button variant="secondary" onClick={exportCsv} disabled={!stats}>
              Export CSV
            </Button>
          </div>

          {!stats ? (
            <Skeleton className="h-48" />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <ReportCard label="Bookings" value={String(stats.totalBookings)} />
                <ReportCard label="Revenue" value={`Rs ${stats.revenue}`} />
                <ReportCard label="Occupancy" value={`${stats.occupancyPct}%`} />
              </div>

              {/* ponytail: CSS bar chart — recharts only if M8 wants fancier */}
              <div className="cb-glass rounded-card p-5">
                <h2 className="mb-3 text-sm font-bold uppercase text-sage">Revenue per day</h2>
                <ol className="space-y-1">
                  {stats.perDay.map((d) => (
                    <li key={d.date} className="flex items-center gap-2 text-xs">
                      <span className="w-20 shrink-0 text-sage">{d.date.slice(5)}</span>
                      <div className="h-4 flex-1 rounded-sm bg-paper">
                        <div
                          className="h-4 rounded-sm bg-pitch"
                          style={{ width: `${(d.revenue / maxRevenue) * 100}%` }}
                          role="img"
                          aria-label={`${d.date}: Rs ${d.revenue}, ${d.bookings} bookings`}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right font-semibold">Rs {d.revenue}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ReportCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="cb-glass rounded-card p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-sage">{label}</p>
      <p className="mt-1 font-display text-3xl text-ink">{value}</p>
    </div>
  );
}
