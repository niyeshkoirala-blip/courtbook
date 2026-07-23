import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { ReviewDto } from '@courtbook/shared';

/** reviews collection — one review per (venue, user), upserted on re-submit. */
const reviewSchema = new Schema(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Denormalized at write time so listing never needs a populate. */
    userName: { type: String, required: true },
    stars: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
  },
  { timestamps: true },
);
reviewSchema.index({ venueId: 1, userId: 1 }, { unique: true });

export type ReviewDoc = HydratedDocument<InferSchemaType<typeof reviewSchema>>;
export const Review = model('Review', reviewSchema);

export function toReviewDto(r: ReviewDoc): ReviewDto {
  return {
    id: r.id as string,
    userName: r.userName,
    stars: r.stars,
    ...(r.comment && { comment: r.comment }),
    createdAt: r.createdAt.toISOString(),
  };
}
