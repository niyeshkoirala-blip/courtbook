import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { VenueDto } from '@courtbook/shared';

/** venues collection (blueprint §5.2). */
const venueSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    area: { type: String, required: true, index: true },
    // GeoJSON Point [lng, lat] — 2dsphere for future distance sort (§3.5)
    geo: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
    amenities: { type: [String], default: [] },
    photos: { type: [{ url: String, publicId: String, _id: false }], default: [] },
    payAtVenue: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['draft', 'pending_review', 'approved', 'rejected'],
      default: 'draft',
      index: true,
    },
    rejectionReason: { type: String },
    // Denormalized review aggregate — kept fresh by review.service on each upsert.
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);
venueSchema.index({ geo: '2dsphere' }, { sparse: true });

export type VenueDoc = HydratedDocument<InferSchemaType<typeof venueSchema>>;
export const Venue = model('Venue', venueSchema);

export function toVenueDto(v: VenueDoc): VenueDto {
  const [lng, lat] = v.geo?.coordinates ?? [];
  return {
    id: v.id as string,
    name: v.name,
    slug: v.slug,
    description: v.description,
    area: v.area,
    ...(lat !== undefined && lng !== undefined && { geo: { lat, lng } }),
    amenities: v.amenities,
    photos: v.photos.map((p) => ({ url: p.url ?? '', publicId: p.publicId ?? '' })),
    payAtVenue: v.payAtVenue,
    status: v.status,
    ...(v.rejectionReason && { rejectionReason: v.rejectionReason }),
    ratingAvg: v.ratingAvg ?? 0,
    ratingCount: v.ratingCount ?? 0,
  };
}
