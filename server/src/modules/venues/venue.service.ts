import { createHash, randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import type { VenueCreateInput, VenueDto, CourtDto, venueQuerySchema } from '@courtbook/shared';
import type { z } from 'zod';
import { AppError } from '../../core/errors.js';
import { config } from '../../core/config.js';
import { User } from '../users/user.model.js';
import { Court, toCourtDto } from '../courts/court.model.js';
import { Venue, toVenueDto, type VenueDoc } from './venue.model.js';

/** Fields that put an approved venue back into review when edited (§4.4 PATCH). */
const MATERIAL_FIELDS = ['name', 'description', 'area', 'geo', 'amenities', 'photos'] as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** geo comes in as {lat,lng}, is stored as GeoJSON [lng,lat] for the 2dsphere index. */
function toGeoJson(geo?: { lat: number; lng: number }) {
  return geo ? { type: 'Point' as const, coordinates: [geo.lng, geo.lat] } : undefined;
}

/**
 * Loads a venue and enforces ownership (§2.7: role alone is never enough).
 * 404 (not 403) for foreign venues — don't confirm existence to outsiders.
 */
export async function findOwnedVenue(venueId: string, userId: string): Promise<VenueDoc> {
  if (!Types.ObjectId.isValid(venueId)) throw new AppError('NOT_FOUND', 404, 'Venue not found');
  const venue = await Venue.findOne({ _id: venueId, deletedAt: null });
  if (!venue || venue.ownerId.toString() !== userId) {
    throw new AppError('NOT_FOUND', 404, 'Venue not found');
  }
  return venue;
}

export async function createVenue(input: VenueCreateInput, userId: string): Promise<VenueDto> {
  // ponytail: first venue self-upgrades player→owner — blueprint defines no
  // other way to become an owner; admin can still demote via M-admin.
  await User.updateOne({ _id: userId, role: 'player' }, { role: 'owner' });

  for (let attempt = 0; ; attempt += 1) {
    const slug =
      attempt === 0
        ? slugify(input.name)
        : `${slugify(input.name)}-${randomBytes(2).toString('hex')}`;
    try {
      const venue = await Venue.create({
        ownerId: userId,
        name: input.name,
        slug,
        description: input.description,
        area: input.area,
        geo: toGeoJson(input.geo),
        amenities: input.amenities,
        payAtVenue: input.payAtVenue,
        photos: input.photos,
      });
      return toVenueDto(venue);
    } catch (err) {
      // slug collision → retry with a random suffix; anything else bubbles
      const isDup = err instanceof Error && 'code' in err && err.code === 11000;
      if (!isDup || attempt >= 2) throw err;
    }
  }
}

export async function updateVenue(
  venueId: string,
  userId: string,
  input: Partial<VenueCreateInput>,
): Promise<VenueDto> {
  const venue = await findOwnedVenue(venueId, userId);

  const touchesMaterial = MATERIAL_FIELDS.some((f) => f in input);
  if (input.name !== undefined) venue.name = input.name;
  if (input.description !== undefined) venue.description = input.description;
  if (input.area !== undefined) venue.area = input.area;
  if (input.geo !== undefined) venue.set('geo', toGeoJson(input.geo));
  if (input.amenities !== undefined) venue.set('amenities', input.amenities);
  if (input.payAtVenue !== undefined) venue.payAtVenue = input.payAtVenue;
  if (input.photos !== undefined) venue.set('photos', input.photos);

  // §4.4: approved venues re-enter review on material edits
  if (venue.status === 'approved' && touchesMaterial) venue.status = 'pending_review';
  await venue.save();
  return toVenueDto(venue);
}

/** draft|rejected → pending_review; needs at least one active court to be reviewable. */
export async function publishVenue(venueId: string, userId: string): Promise<VenueDto> {
  const venue = await findOwnedVenue(venueId, userId);
  if (venue.status !== 'draft' && venue.status !== 'rejected') {
    throw new AppError('INVALID_STATUS', 409, `Cannot publish a ${venue.status} venue`);
  }
  const courtCount = await Court.countDocuments({ venueId, active: true, deletedAt: null });
  if (courtCount === 0) {
    throw new AppError('NO_COURTS', 422, 'Add at least one court before publishing');
  }
  venue.status = 'pending_review';
  venue.rejectionReason = null;
  await venue.save();
  return toVenueDto(venue);
}

/** Public search (§4.4): approved only, filters + _id-cursor pagination. */
export async function listVenues(query: z.infer<typeof venueQuerySchema>): Promise<{
  venues: VenueDto[];
  nextCursor?: string;
}> {
  const filter: Record<string, unknown> = { status: 'approved', deletedAt: null };
  if (query.area)
    filter.area = new RegExp(`^${query.area.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  if (query.amenities?.length) filter.amenities = { $all: query.amenities };
  if (query.cursor) filter._id = { $lt: new Types.ObjectId(query.cursor) };

  if (query.priceMax !== undefined) {
    // two indexed queries beat a $lookup at this scale (§9)
    const venueIds = await Court.distinct('venueId', {
      basePrice: { $lte: query.priceMax },
      active: true,
      deletedAt: null,
    });
    filter._id = query.cursor
      ? { $lt: new Types.ObjectId(query.cursor), $in: venueIds }
      : { $in: venueIds };
  }

  const docs = await Venue.find(filter)
    .sort({ _id: -1 })
    .limit(query.limit + 1);
  const page = docs.slice(0, query.limit);
  return {
    venues: page.map(toVenueDto),
    ...(docs.length > query.limit && { nextCursor: page[page.length - 1]!.id as string }),
  };
}

/** Slug fetch with §7.5 visibility: drafts/pending only for owner + admin. */
export async function getVenueBySlug(
  slug: string,
  viewer?: { id: string; role: string },
): Promise<{ venue: VenueDto; courts: CourtDto[] }> {
  const venue = await Venue.findOne({ slug, deletedAt: null });
  const visible =
    venue &&
    (venue.status === 'approved' ||
      viewer?.role === 'admin' ||
      (viewer && venue.ownerId.toString() === viewer.id));
  if (!venue || !visible) throw new AppError('NOT_FOUND', 404, 'Venue not found');

  const courts = await Court.find({ venueId: venue._id, active: true, deletedAt: null });
  return { venue: toVenueDto(venue), courts: courts.map(toCourtDto) };
}

/**
 * Cloudinary signed-upload params (§2.6): browser uploads directly to
 * Cloudinary; we only sign. Signature = sha1 of sorted params + api secret —
 * stdlib, no SDK needed.
 */
export async function signPhotoUpload(
  venueId: string,
  userId: string,
): Promise<Record<string, string | number>> {
  await findOwnedVenue(venueId, userId);
  const { cloudinaryCloudName, cloudinaryApiKey, cloudinaryApiSecret } = config;
  if (!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
    throw new AppError('NOT_CONFIGURED', 501, 'Photo uploads are not configured on this server');
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `venues/${venueId}`;
  // params sorted alphabetically, joined k=v&k=v, secret appended (Cloudinary spec)
  const toSign = `folder=${folder}&timestamp=${timestamp}${cloudinaryApiSecret}`;
  const signature = createHash('sha1').update(toSign).digest('hex');
  return { cloudName: cloudinaryCloudName, apiKey: cloudinaryApiKey, timestamp, folder, signature };
}
