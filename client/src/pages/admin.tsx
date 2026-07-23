import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { registerSchema, type RegisterInput, type UserDto, type VenueDto } from '@courtbook/shared';
import { api, post, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { Button, Field, Skeleton } from '../components/ui';
import { Modal } from '../components/modal';

/**
 * Platform admin (§3.5): owner-signup approval queue + admin provisioning.
 * ponytail: the full searchable user table, audit viewer and flags editor from
 * §3.5 are separate slices — this covers exactly the account-management asks.
 */
export function AdminPage() {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<UserDto | null>(null);

  const { data: requests, isPending } = useQuery({
    queryKey: ['owner-requests'],
    queryFn: () => api<UserDto[]>('/admin/owner-requests'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['owner-requests'] });

  const approve = useMutation({
    mutationFn: (id: string) => post(`/admin/owner-requests/${id}/approve`),
    onSuccess: () => {
      toast.success('Owner approved — they can now log in');
      void invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Approve failed'),
  });

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl uppercase tracking-wide text-ink">Admin</h1>

      <PlatformOverview />
      <ManageFutsals />

      <section className="space-y-3">
        <h2 className="font-display text-xl uppercase tracking-wide text-ink">
          Owner requests
          {requests && requests.length > 0 && (
            <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-sm text-accent-deep">
              {requests.length}
            </span>
          )}
        </h2>

        {isPending ? (
          <Skeleton className="h-32" />
        ) : requests && requests.length > 0 ? (
          <ul className="space-y-3">
            {requests.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 cb-glass rounded-card p-4"
              >
                <div>
                  <p className="font-medium text-ink">{u.name}</p>
                  <p className="text-sm text-sage">
                    {u.email}
                    {u.phone ? ` · ${u.phone}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => approve.mutate(u.id)}
                    loading={approve.isPending && approve.variables === u.id}
                  >
                    Approve
                  </Button>
                  <Button variant="secondary" onClick={() => setRejecting(u)}>
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-sage">No pending owner requests.</p>
        )}
      </section>

      <CreateAdminForm />

      {rejecting && (
        <RejectModal user={rejecting} onDone={() => setRejecting(null)} onRejected={invalidate} />
      )}
    </div>
  );
}

const rs = (n: number) => `Rs ${n.toLocaleString('en-IN')}`;

const venueStatusStyle: Record<string, string> = {
  draft: 'bg-ink/10 text-ink',
  pending_review: 'bg-accent/15 text-accent-deep',
  approved: 'bg-mint/40 text-pitch',
  rejected: 'bg-danger/10 text-danger',
};

type Stats = { venues: number; owners: number; bookings: number; revenue: number };

/** Platform-wide totals — bookings & revenue at a glance (§3.5). */
function PlatformOverview() {
  const { data, isPending } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api<Stats>('/admin/stats'),
  });

  if (isPending) return <Skeleton className="h-24" />;
  const cards = [
    ['Futsals', String(data?.venues ?? 0)],
    ['Owners', String(data?.owners ?? 0)],
    ['Bookings', String(data?.bookings ?? 0)],
    ['Revenue', rs(data?.revenue ?? 0)],
  ] as const;

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(([label, value]) => (
        <div key={label} className="cb-glass rounded-card p-4">
          <p className="text-xs uppercase tracking-wide text-sage">{label}</p>
          <p className="mt-1 font-display text-2xl text-ink">{value}</p>
        </div>
      ))}
    </section>
  );
}

/** Every futsal on the platform — click to inspect, with the ability to remove (§4.4). */
function ManageFutsals() {
  const queryClient = useQueryClient();
  const [viewing, setViewing] = useState<VenueDto | null>(null);
  const { data: venues, isPending } = useQuery({
    queryKey: ['admin-venues'],
    queryFn: () => api<VenueDto[]>('/admin/venues/all'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/venues/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Futsal removed');
      void queryClient.invalidateQueries({ queryKey: ['admin-venues'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Remove failed'),
  });

  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl uppercase tracking-wide text-ink">Manage futsals</h2>
      {isPending ? (
        <Skeleton className="h-32" />
      ) : venues && venues.length > 0 ? (
        <ul className="space-y-3">
          {venues.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 cb-glass rounded-card p-4"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setViewing(v)}
              >
                <p className="font-medium text-ink underline-offset-2 hover:underline">{v.name}</p>
                <p className="text-sm text-sage">{v.area}</p>
              </button>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${venueStatusStyle[v.status] ?? 'bg-ink/10 text-ink'}`}
                >
                  {v.status.replace('_', ' ')}
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  loading={remove.isPending && remove.variables === v.id}
                  // ponytail: native confirm — admin-only, low-frequency destructive action
                  onClick={() => {
                    if (confirm(`Remove "${v.name}"? This hides it from the platform.`))
                      remove.mutate(v.id);
                  }}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-sage">No futsals yet.</p>
      )}
      <VenueDetailModal venue={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}

/** Read-only futsal details for the admin (from the list DTO — no extra fetch). */
function VenueDetailModal({ venue, onClose }: { venue: VenueDto | null; onClose: () => void }) {
  return (
    <Modal open={!!venue} title={venue?.name ?? ''} onClose={onClose}>
      {venue && (
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-semibold text-ink">Area</dt>
            <dd className="text-sage">{venue.area}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Status</dt>
            <dd>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${venueStatusStyle[venue.status] ?? 'bg-ink/10 text-ink'}`}
              >
                {venue.status.replace('_', ' ')}
              </span>
              {venue.status === 'rejected' && venue.rejectionReason && (
                <span className="ml-2 text-xs text-danger">{venue.rejectionReason}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Description</dt>
            <dd className="text-sage">{venue.description || '—'}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Amenities</dt>
            <dd className="text-sage capitalize">
              {venue.amenities.length ? venue.amenities.join(', ').replace(/_/g, ' ') : '—'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Pay at venue</dt>
            <dd className="text-sage">{venue.payAtVenue ? 'Allowed' : 'No'}</dd>
          </div>
          {venue.photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {venue.photos.map((p) => (
                <img
                  key={p.publicId}
                  src={p.url}
                  alt=""
                  className="h-24 w-32 shrink-0 rounded-lg object-cover"
                />
              ))}
            </div>
          )}
        </dl>
      )}
    </Modal>
  );
}

function RejectModal({
  user,
  onDone,
  onRejected,
}: {
  user: UserDto;
  onDone: () => void;
  onRejected: () => void;
}) {
  const [reason, setReason] = useState('');
  const reject = useMutation({
    mutationFn: () => post(`/admin/owner-requests/${user.id}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Owner request rejected');
      onRejected();
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Reject failed'),
  });

  return (
    <Modal open title={`Reject ${user.name}`} onClose={onDone}>
      <Field
        label="Reason"
        hint="Shared with the applicant by email (min 3 characters)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button
          onClick={() => reject.mutate()}
          loading={reject.isPending}
          disabled={reason.trim().length < 3}
        >
          Reject
        </Button>
      </div>
    </Modal>
  );
}

function CreateAdminForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(input: RegisterInput) {
    try {
      await post('/admin/users', { ...input, phone: input.phone || undefined });
      toast.success(`Admin account created for ${input.email}`);
      reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create admin');
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl uppercase tracking-wide text-ink">Create admin</h2>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="max-w-md space-y-4 cb-glass rounded-card p-6"
        noValidate
      >
        <Field label="Name" autoComplete="off" error={errors.name?.message} {...register('name')} />
        <Field
          label="Email"
          type="email"
          autoComplete="off"
          error={errors.email?.message}
          {...register('email')}
        />
        <Field
          label="Temporary password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters — share it securely; they can reset later"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={isSubmitting}>
          Create admin
        </Button>
      </form>
    </section>
  );
}
