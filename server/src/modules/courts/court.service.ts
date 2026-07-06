import { Types } from 'mongoose';
import type { CourtCreateInput, CourtDto } from '@courtbook/shared';
import { AppError } from '../../core/errors.js';
import { findOwnedVenue } from '../venues/venue.service.js';
import { Court, toCourtDto, type CourtDoc } from './court.model.js';

/**
 * Overrides must sit inside that day's open hours (§5.2) — needs the full
 * schedule, so it can't live in the Zod schema.
 */
function assertOverridesInsideSchedule(
  schedule: CourtCreateInput['schedule'],
  overrides: CourtCreateInput['priceOverrides'],
): void {
  for (const o of overrides) {
    const days = o.dayOfWeek === undefined ? schedule : [schedule[o.dayOfWeek]!];
    const outside = days.some((d) => d.closed || o.startMin < d.openMin || o.endMin > d.closeMin);
    if (outside) {
      throw new AppError('VALIDATION', 422, 'Price override falls outside open hours', {
        override: o,
      });
    }
  }
}

export async function createCourt(
  venueId: string,
  userId: string,
  input: CourtCreateInput,
): Promise<CourtDto> {
  await findOwnedVenue(venueId, userId);
  assertOverridesInsideSchedule(input.schedule, input.priceOverrides);
  const court = await Court.create({ venueId, ...input });
  return toCourtDto(court);
}

async function findOwnedCourt(venueId: string, courtId: string, userId: string): Promise<CourtDoc> {
  await findOwnedVenue(venueId, userId);
  if (!Types.ObjectId.isValid(courtId)) throw new AppError('NOT_FOUND', 404, 'Court not found');
  const court = await Court.findOne({ _id: courtId, venueId, deletedAt: null });
  if (!court) throw new AppError('NOT_FOUND', 404, 'Court not found');
  return court;
}

export async function updateCourt(
  venueId: string,
  courtId: string,
  userId: string,
  input: Partial<CourtCreateInput>,
): Promise<CourtDto> {
  const court = await findOwnedCourt(venueId, courtId, userId);
  court.set(input);
  // validate the merged result — an override patch must respect the (possibly patched) schedule
  assertOverridesInsideSchedule(
    court.schedule.map((d) => ({
      openMin: d.openMin ?? 0,
      closeMin: d.closeMin ?? 0,
      closed: d.closed ?? false,
    })),
    court.priceOverrides.map((o) => ({
      ...(o.dayOfWeek !== null && o.dayOfWeek !== undefined && { dayOfWeek: o.dayOfWeek }),
      startMin: o.startMin ?? 0,
      endMin: o.endMin ?? 0,
      price: o.price ?? 0,
    })),
  );
  await court.save();
  return toCourtDto(court);
}

/**
 * Soft delete (§4.4).
 * ponytail: the HAS_FUTURE_BOOKINGS 409 guard lands in M3 with the bookings
 * collection — nothing to conflict with until then.
 */
export async function deleteCourt(venueId: string, courtId: string, userId: string): Promise<void> {
  const court = await findOwnedCourt(venueId, courtId, userId);
  court.active = false;
  court.deletedAt = new Date();
  await court.save();
}
