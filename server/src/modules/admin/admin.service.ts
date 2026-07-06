import { Types } from 'mongoose';
import type { VenueDto } from '@courtbook/shared';
import { AppError } from '../../core/errors.js';
import { Venue, toVenueDto } from '../venues/venue.model.js';
import { User } from '../users/user.model.js';
import { queueEmail } from '../notifications/outbox.js';
import { writeAudit } from './audit.model.js';

/** Venue approval queue (§4.4 Admin, Phase 12). Every action → audit entry. */

export async function listVenuesByStatus(status: string): Promise<VenueDto[]> {
  const venues = await Venue.find({ status, deletedAt: null }).sort({ updatedAt: 1 });
  return venues.map(toVenueDto);
}

async function reviewableVenue(venueId: string) {
  if (!Types.ObjectId.isValid(venueId)) throw new AppError('NOT_FOUND', 404, 'Venue not found');
  const venue = await Venue.findOne({ _id: venueId, deletedAt: null });
  if (!venue) throw new AppError('NOT_FOUND', 404, 'Venue not found');
  if (venue.status !== 'pending_review') {
    throw new AppError('INVALID_STATUS', 409, `Venue is ${venue.status}, not pending_review`);
  }
  return venue;
}

async function notifyOwner(
  ownerId: Types.ObjectId,
  templateId: string,
  payload: Record<string, string>,
) {
  const owner = await User.findById(ownerId);
  if (owner) await queueEmail(owner.email, templateId, { name: owner.name, ...payload });
}

export async function approveVenue(
  venueId: string,
  actor: { id: string; ip?: string },
): Promise<VenueDto> {
  const venue = await reviewableVenue(venueId);
  venue.status = 'approved';
  venue.rejectionReason = null;
  await venue.save();

  await writeAudit({
    actorId: actor.id,
    action: 'venue.approve',
    targetType: 'venue',
    targetId: venueId,
    before: { status: 'pending_review' },
    after: { status: 'approved' },
    ...(actor.ip && { ip: actor.ip }),
  });
  await notifyOwner(venue.ownerId, 'venue_approved', { venueName: venue.name });
  return toVenueDto(venue);
}

export async function rejectVenue(
  venueId: string,
  reason: string,
  actor: { id: string; ip?: string },
): Promise<VenueDto> {
  const venue = await reviewableVenue(venueId);
  venue.status = 'rejected';
  venue.rejectionReason = reason;
  await venue.save();

  await writeAudit({
    actorId: actor.id,
    action: 'venue.reject',
    targetType: 'venue',
    targetId: venueId,
    before: { status: 'pending_review' },
    after: { status: 'rejected', reason },
    ...(actor.ip && { ip: actor.ip }),
  });
  await notifyOwner(venue.ownerId, 'venue_rejected', { venueName: venue.name, reason });
  return toVenueDto(venue);
}
