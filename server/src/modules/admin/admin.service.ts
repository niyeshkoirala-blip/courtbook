import { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import type { RegisterInput, UserDto, VenueDto } from '@courtbook/shared';
import { AppError } from '../../core/errors.js';
import { config } from '../../core/config.js';
import { Venue, toVenueDto } from '../venues/venue.model.js';
import { User, toUserDto } from '../users/user.model.js';
import { Booking } from '../bookings/booking.model.js';
import { queueEmail } from '../notifications/outbox.js';
import { writeAudit } from './audit.model.js';

/** Venue approval queue (§4.4 Admin, Phase 12). Every action → audit entry. */

export async function listVenuesByStatus(status: string): Promise<VenueDto[]> {
  const venues = await Venue.find({ status, deletedAt: null }).sort({ updatedAt: 1 });
  return venues.map(toVenueDto);
}

export interface PlatformStats {
  venues: number;
  owners: number;
  bookings: number; // confirmed + completed only
  revenue: number; // NPR, confirmed + completed only
}

/** Platform-wide overview for the admin dashboard (§3.5, §4.4 GET /admin/stats). */
export async function platformStats(): Promise<PlatformStats> {
  const [venues, owners, agg] = await Promise.all([
    Venue.countDocuments({ deletedAt: null }),
    User.countDocuments({ role: 'owner', deletedAt: null }),
    // Revenue counts real money only: same confirmed+completed rule as owner reports.
    Booking.aggregate<{ count: number; revenue: number }>([
      { $match: { status: { $in: ['confirmed', 'completed'] } } },
      { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$price' } } },
    ]),
  ]);
  const { count = 0, revenue = 0 } = agg[0] ?? {};
  return { venues, owners, bookings: count, revenue };
}

/** Every venue (any status) for the admin management table — newest first. */
export async function listAllVenues(): Promise<VenueDto[]> {
  const venues = await Venue.find({ deletedAt: null }).sort({ createdAt: -1 });
  return venues.map(toVenueDto);
}

/** Soft-remove a futsal (§4.4). Hides it everywhere — every read filters deletedAt. */
export async function removeVenue(
  venueId: string,
  actor: { id: string; ip?: string },
): Promise<void> {
  if (!Types.ObjectId.isValid(venueId)) throw new AppError('NOT_FOUND', 404, 'Venue not found');
  const venue = await Venue.findOne({ _id: venueId, deletedAt: null });
  if (!venue) throw new AppError('NOT_FOUND', 404, 'Venue not found');
  venue.deletedAt = new Date();
  await venue.save();

  await writeAudit({
    actorId: actor.id,
    action: 'venue.remove',
    targetType: 'venue',
    targetId: venueId,
    before: { status: venue.status },
    after: { deleted: true },
    ...(actor.ip && { ip: actor.ip }),
  });
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

/* ── Owner-account approval queue & admin provisioning (§8 priv-escalation) ── */

/** Fetch a user whose owner signup is still pending review, else 404/409. */
async function pendingOwner(userId: string) {
  if (!Types.ObjectId.isValid(userId)) throw new AppError('NOT_FOUND', 404, 'User not found');
  const user = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) throw new AppError('NOT_FOUND', 404, 'User not found');
  if (user.ownerRequest !== 'pending') {
    throw new AppError('INVALID_STATUS', 409, 'This user has no pending owner request');
  }
  return user;
}

export async function listOwnerRequests(): Promise<UserDto[]> {
  const users = await User.find({ ownerRequest: 'pending', deletedAt: null }).sort({
    createdAt: 1,
  });
  return users.map(toUserDto);
}

export async function approveOwner(
  userId: string,
  actor: { id: string; ip?: string },
): Promise<UserDto> {
  const user = await pendingOwner(userId);
  user.role = 'owner';
  user.ownerRequest = null;
  // Admin approval doubles as verification for owners — let them log in now.
  user.emailVerifiedAt ??= new Date();
  await user.save();

  await writeAudit({
    actorId: actor.id,
    action: 'user.owner_approve',
    targetType: 'user',
    targetId: userId,
    before: { role: 'player', ownerRequest: 'pending' },
    after: { role: 'owner' },
    ...(actor.ip && { ip: actor.ip }),
  });
  await queueEmail(user.email, 'owner_approved', {
    name: user.name,
    link: `${config.corsOrigins[0]}/auth/login`,
  });
  return toUserDto(user);
}

export async function rejectOwner(
  userId: string,
  reason: string,
  actor: { id: string; ip?: string },
): Promise<UserDto> {
  const user = await pendingOwner(userId);
  user.ownerRequest = 'rejected';
  await user.save();

  await writeAudit({
    actorId: actor.id,
    action: 'user.owner_reject',
    targetType: 'user',
    targetId: userId,
    before: { ownerRequest: 'pending' },
    after: { ownerRequest: 'rejected', reason },
    ...(actor.ip && { ip: actor.ip }),
  });
  await queueEmail(user.email, 'owner_rejected', { name: user.name, reason });
  return toUserDto(user);
}

/**
 * Mint a new admin directly (no email-verify step — an admin vouches for it).
 * The only path to the admin role; role changes never go through open signup.
 */
export async function createAdmin(
  input: RegisterInput,
  actor: { id: string; ip?: string },
): Promise<UserDto> {
  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  try {
    const user = await User.create({
      name: input.name,
      email: input.email,
      ...(input.phone && { phone: input.phone }),
      passwordHash,
      role: 'admin',
      emailVerifiedAt: new Date(),
    });
    await writeAudit({
      actorId: actor.id,
      action: 'user.create_admin',
      targetType: 'user',
      targetId: user.id as string,
      after: { role: 'admin', email: user.email },
      ...(actor.ip && { ip: actor.ip }),
    });
    return toUserDto(user);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 11000) {
      throw new AppError('EMAIL_EXISTS', 409, 'An account with this email already exists');
    }
    throw err;
  }
}
