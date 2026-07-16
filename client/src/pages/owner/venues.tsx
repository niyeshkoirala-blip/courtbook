import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AMENITIES, formatNPT, type VenueDto } from '@courtbook/shared';
import { api, post, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { toast } from '../../lib/toast';
import { Button, Field, Skeleton } from '../../components/ui';
import { Modal } from '../../components/modal';
import { OwnerNav, timeOptions, useOwnerVenues } from './common';

/**
 * Lean venue management (M6): create venue → add court → publish.
 * ponytail: single forms instead of the 5-step wizard (design/11) — wizard
 * polish is an M8 item; this covers the §6.4 onboarding flow end to end.
 */
export function OwnerVenuesPage() {
  const { data: venues, isPending } = useOwnerVenues();
  const [creating, setCreating] = useState(false);
  const [courtFor, setCourtFor] = useState<VenueDto | null>(null);
  const [editing, setEditing] = useState<VenueDto | null>(null);
  const queryClient = useQueryClient();
  const refreshUser = useAuth((s) => s.user);

  const publish = useMutation({
    mutationFn: (venueId: string) => post(`/venues/${venueId}/publish`),
    onSuccess: () => {
      toast.success('Submitted for review — we email you once approved');
      void queryClient.invalidateQueries({ queryKey: ['owner-venues'] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError && err.code === 'NO_COURTS'
          ? 'Add at least one court before publishing'
          : err instanceof ApiError
            ? err.message
            : 'Publish failed',
      ),
  });

  const statusStyle: Record<string, string> = {
    draft: 'bg-ink/10 text-ink',
    pending_review: 'bg-accent/15 text-accent-deep',
    approved: 'bg-mint/40 text-pitch',
    rejected: 'bg-danger/10 text-danger',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl uppercase tracking-wide text-pitch">My venues</h1>
        <Button onClick={() => setCreating(true)}>Add venue</Button>
      </div>
      <OwnerNav />

      {isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <ul className="space-y-3">
          {(venues ?? []).map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-white p-5"
            >
              <div>
                <p className="font-display uppercase tracking-wide text-pitch">{v.name}</p>
                <p className="text-sm text-sage">{v.area}</p>
                <p className="mt-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle[v.status]}`}
                  >
                    {v.status.replace('_', ' ')}
                  </span>
                  {v.status === 'rejected' && v.rejectionReason && (
                    <span className="ml-2 text-xs text-danger">{v.rejectionReason}</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(v)}>
                  Edit details
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCourtFor(v)}>
                  Add court
                </Button>
                {(v.status === 'draft' || v.status === 'rejected') && (
                  <Button
                    size="sm"
                    loading={publish.isPending}
                    onClick={() => publish.mutate(v.id)}
                  >
                    Publish
                  </Button>
                )}
                {v.status === 'approved' && (
                  <Link
                    to={`/venues/${v.slug}`}
                    className="self-center text-sm text-pitch underline"
                  >
                    View public page
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {refreshUser?.role === 'player' && (
        <p className="text-xs text-sage">
          Creating your first venue upgrades your account to an owner account.
        </p>
      )}

      <CreateVenueModal open={creating} onClose={() => setCreating(false)} />
      <AddCourtModal venue={courtFor} onClose={() => setCourtFor(null)} />
      <EditVenueModal venue={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/** Edit an existing venue's details (PATCH /venues/:id). */
function EditVenueModal({ venue, onClose }: { venue: VenueDto | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [description, setDescription] = useState('');
  const [payAtVenue, setPayAtVenue] = useState(false);
  const [amenities, setAmenities] = useState<string[]>([]);

  // Re-seed the form each time a venue is opened.
  useEffect(() => {
    if (!venue) return;
    setName(venue.name);
    setArea(venue.area);
    setDescription(venue.description);
    setPayAtVenue(venue.payAtVenue);
    setAmenities(venue.amenities);
  }, [venue]);

  const save = useMutation({
    mutationFn: () =>
      api(`/venues/${venue!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, area, description, payAtVenue, amenities }),
      }),
    onSuccess: () => {
      toast.success('Venue details updated');
      void queryClient.invalidateQueries({ queryKey: ['owner-venues'] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not save changes'),
  });

  const toggle = (a: string) =>
    setAmenities((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));

  return (
    <Modal open={!!venue} title={`Edit — ${venue?.name ?? ''}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Venue name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Area" value={area} onChange={(e) => setArea(e.target.value)} />
        <Field
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <fieldset>
          <legend className="text-sm font-semibold text-ink">Amenities</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {AMENITIES.map((a) => (
              <label key={a} className="flex items-center gap-2 text-sm capitalize">
                <input type="checkbox" checked={amenities.includes(a)} onChange={() => toggle(a)} />
                {a.replace(/_/g, ' ')}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={payAtVenue}
            onChange={(e) => setPayAtVenue(e.target.checked)}
          />
          Allow pay-at-venue
        </label>
        {venue?.status === 'approved' && (
          <p className="text-xs text-accent-deep">
            Heads up: editing an approved venue sends it back for admin review.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={name.length < 3 || area.length < 2}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Save changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CreateVenueModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [description, setDescription] = useState('');
  const [payAtVenue, setPayAtVenue] = useState(false);

  const create = useMutation({
    mutationFn: () => post('/venues', { name, area, description, payAtVenue }),
    onSuccess: () => {
      toast.success('Venue created as a draft — now add a court');
      void queryClient.invalidateQueries({ queryKey: ['owner-venues'] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not create venue'),
  });

  return (
    <Modal open={open} title="Add venue" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Venue name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field
          label="Area"
          placeholder="e.g. Baneshwor"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        />
        <Field
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={payAtVenue}
            onChange={(e) => setPayAtVenue(e.target.checked)}
          />
          Allow pay-at-venue
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={name.length < 3 || area.length < 2}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            Create draft
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** One schedule for all 7 days keeps the form tiny; per-day editing is M8 polish. */
function AddCourtModal({ venue, onClose }: { venue: VenueDto | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('Court A');
  const [surface, setSurface] = useState('turf');
  const [size, setSize] = useState('5v5');
  const [basePrice, setBasePrice] = useState('1500');
  const [openMin, setOpenMin] = useState(360);
  const [closeMin, setCloseMin] = useState(1260);

  const create = useMutation({
    mutationFn: () =>
      post(`/venues/${venue!.id}/courts`, {
        name,
        surface,
        size,
        basePrice: Number(basePrice),
        schedule: Array.from({ length: 7 }, () => ({ openMin, closeMin, closed: false })),
      }),
    onSuccess: () => {
      toast.success('Court added');
      void queryClient.invalidateQueries({ queryKey: ['venue', venue?.slug] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not add court'),
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
    <Modal open={!!venue} title={`Add court — ${venue?.name ?? ''}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Court name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold">
            Surface
            <select
              className="mt-1 w-full rounded-lg border border-sage/40 px-3 py-2 text-sm"
              value={surface}
              onChange={(e) => setSurface(e.target.value)}
            >
              {['turf', 'wood', 'concrete', 'asphalt'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <Field label="Size" value={size} onChange={(e) => setSize(e.target.value)} />
        </div>
        <Field
          label="Price per hour (NPR)"
          inputMode="numeric"
          value={basePrice}
          onChange={(e) => setBasePrice(e.target.value.replace(/\D/g, ''))}
        />
        <div className="grid grid-cols-2 gap-3">
          {timeSelect(openMin, setOpenMin, 'Opens')}
          {timeSelect(closeMin, setCloseMin, 'Closes')}
        </div>
        <p className="text-xs text-sage">Applies to all 7 days — fine-tune per day later.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={!name || Number(basePrice) < 100 || closeMin <= openMin}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            Add court
          </Button>
        </div>
      </div>
    </Modal>
  );
}
