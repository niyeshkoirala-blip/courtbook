import { Types } from 'mongoose';
import type { ReviewCreateInput, ReviewDto } from '@courtbook/shared';
import { AppError } from '../../core/errors.js';
import { Booking } from '../bookings/booking.model.js';
import { User } from '../users/user.model.js';
import { Venue } from '../venues/venue.model.js';
import { Review, toReviewDto } from './review.model.js';

/** Latest reviews for a venue's public page. */
export async function listReviews(venueId: string): Promise<ReviewDto[]> {
  if (!Types.ObjectId.isValid(venueId)) throw new AppError('NOT_FOUND', 404, 'Venue not found');
  const reviews = await Review.find({ venueId }).sort({ _id: -1 }).limit(50);
  return reviews.map(toReviewDto);
}

/**
 * Create or replace the caller's review. Only players who actually booked the
 * venue (confirmed or completed) may review — the lazy anti-spam gate.
 * ponytail: no moderation queue (blueprint Phase 13) — add if abuse appears.
 */
export async function upsertReview(
  venueId: string,
  userId: string,
  input: ReviewCreateInput,
): Promise<ReviewDto> {
  if (!Types.ObjectId.isValid(venueId)) throw new AppError('NOT_FOUND', 404, 'Venue not found');
  const venue = await Venue.findOne({ _id: venueId, status: 'approved', deletedAt: null });
  if (!venue) throw new AppError('NOT_FOUND', 404, 'Venue not found');

  const hasBooked = await Booking.exists({
    venueId,
    userId,
    status: { $in: ['confirmed', 'completed'] },
  });
  if (!hasBooked) {
    throw new AppError(
      'REVIEW_NOT_ALLOWED',
      403,
      'Only players who booked this venue can review it',
    );
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 404, 'User not found');

  const review = await Review.findOneAndUpdate(
    { venueId, userId },
    { stars: input.stars, comment: input.comment ?? '', userName: user.name },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  // Recompute the denormalized aggregate the search cards read.
  const [agg] = await Review.aggregate<{ avg: number; count: number }>([
    { $match: { venueId: venue._id } },
    { $group: { _id: null, avg: { $avg: '$stars' }, count: { $sum: 1 } } },
  ]);
  await Venue.updateOne(
    { _id: venue._id },
    { ratingAvg: Math.round((agg?.avg ?? 0) * 10) / 10, ratingCount: agg?.count ?? 0 },
  );

  return toReviewDto(review);
}
