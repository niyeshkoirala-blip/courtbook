import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { VenueDto } from '@courtbook/shared';
import { api } from '../../lib/api';

/** Shared owner-area bits: venue list query, sub-nav, venue picker. */

export function useOwnerVenues() {
  return useQuery({
    queryKey: ['owner-venues'],
    queryFn: () => api<VenueDto[]>('/owner/venues'),
  });
}

export function OwnerNav() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold ${
      isActive ? 'bg-pitch text-mint' : 'bg-white text-pitch hover:bg-pitch/10'
    }`;
  return (
    <nav aria-label="Owner" className="flex flex-wrap gap-2">
      <NavLink to="/owner" end className={link}>
        Today
      </NavLink>
      <NavLink to="/owner/calendar" className={link}>
        Calendar
      </NavLink>
      <NavLink to="/owner/reports" className={link}>
        Reports
      </NavLink>
      <NavLink to="/owner/venues" className={link}>
        My venues
      </NavLink>
    </nav>
  );
}

export function VenuePicker({
  venues,
  value,
  onChange,
}: {
  venues: VenueDto[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (venues.length <= 1) return null;
  return (
    <select
      aria-label="Venue"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-sage/40 bg-white px-4 py-2 text-sm font-semibold text-pitch outline-none"
    >
      {venues.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </select>
  );
}

export const timeOptions = Array.from({ length: 48 }, (_, i) => i * 30);
