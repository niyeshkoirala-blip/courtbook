/**
 * Adds demo photos + reviews to EVERY approved venue so the app looks alive
 * for a walkthrough/demo. Idempotent — safe to re-run.
 *
 *   npm run seed:media
 *
 * Photos: a rotating pool of real (Unsplash) futsal/turf images written to
 * venue.photos. Reviews: a set of demo reviewer accounts, 3 reviews per venue,
 * inserted straight into the collection (bypasses the "must have booked" gate —
 * this is seed data), then venue.ratingAvg/ratingCount are recomputed with the
 * same aggregation the review service uses.
 */
import bcrypt from 'bcryptjs';
import { config } from '../core/config.js';
import { connectDb, disconnectDb } from '../core/db.js';
import { logger } from '../core/logger.js';
import { User } from '../modules/users/user.model.js';
import { Venue } from '../modules/venues/venue.model.js';
import { Review } from '../modules/reviews/review.model.js';

// Verified-loading Unsplash images (football pitch / turf / futsal).
const IMAGE_IDS = [
  'photo-1459865264687-595d652de67e',
  'photo-1551958219-acbc608c6377',
  'photo-1431324155629-1a6deb1dec8d',
  'photo-1522778119026-d647f0596c20',
  'photo-1489944440615-453fc2b6a9a9',
  'photo-1560272564-c83b66b1ad12',
  'photo-1577223625816-7546f13df25d',
  'photo-1543326727-cf6c39e8f84c',
  'photo-1517927033932-b3d18e61fb3a',
];
const imgUrl = (id: string): string =>
  `https://images.unsplash.com/${id}?w=1000&q=80&auto=format&fit=crop`;

// Demo reviewers (Nepali names) — created verified so they look like real users.
const REVIEWERS = [
  'Aashish Shrestha',
  'Bibek Gurung',
  'Sujan Tamang',
  'Prabin Maharjan',
  'Nabin Thapa',
  'Rojan Karki',
  'Suman Adhikari',
  'Anish Bhandari',
];

// Comment pool paired with a plausible star rating.
const REVIEW_POOL: { stars: number; comment: string }[] = [
  {
    stars: 5,
    comment: 'Great turf, well maintained and floodlights are bright. Booking was smooth.',
  },
  {
    stars: 5,
    comment: 'Best futsal in the area — good grip, no injuries. Will come back every week.',
  },
  { stars: 4, comment: 'Nice pitch and easy parking. Gets busy in the evenings so book early.' },
  {
    stars: 4,
    comment: 'Good value for money. Changing room could be a bit cleaner but overall solid.',
  },
  { stars: 5, comment: 'Smooth online booking and the slot was ready on time. Highly recommend.' },
  {
    stars: 3,
    comment: 'Decent ground but the ball rolls fast on this surface. Floodlights are good though.',
  },
  { stars: 4, comment: 'Played a 5v5 here, turf quality is nice. Canteen nearby is a plus.' },
  { stars: 5, comment: 'Perfect for weekend games with friends. Staff were helpful and friendly.' },
];

async function main(): Promise<void> {
  await connectDb();

  // Reviewer accounts (reuse if present).
  const passwordHash = await bcrypt.hash('demo-password-1', config.bcryptRounds);
  const reviewerIds: { id: unknown; name: string }[] = [];
  for (let i = 0; i < REVIEWERS.length; i += 1) {
    const name = REVIEWERS[i]!;
    const email = `reviewer${i + 1}@courtbook.local`;
    const u = await User.findOneAndUpdate(
      { email },
      { name, role: 'player', emailVerifiedAt: new Date(), passwordHash },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    reviewerIds.push({ id: u!._id, name });
  }

  const venues = await Venue.find({ status: 'approved' });
  let photoUpdates = 0;
  let reviewUpserts = 0;

  for (let vi = 0; vi < venues.length; vi += 1) {
    const venue = venues[vi]!;

    // 3 rotating photos per venue.
    const photos = [0, 1, 2].map((k) => {
      const id = IMAGE_IDS[(vi + k) % IMAGE_IDS.length]!;
      return { url: imgUrl(id), publicId: `demo/${id}` };
    });
    await Venue.updateOne({ _id: venue._id }, { photos });
    photoUpdates += 1;

    // 3 reviews per venue from distinct reviewers (rotate offset so it varies).
    for (let k = 0; k < 3; k += 1) {
      const reviewer = reviewerIds[(vi + k) % reviewerIds.length]!;
      const pick = REVIEW_POOL[(vi + k) % REVIEW_POOL.length]!;
      await Review.findOneAndUpdate(
        { venueId: venue._id, userId: reviewer.id },
        { stars: pick.stars, comment: pick.comment, userName: reviewer.name },
        { upsert: true, setDefaultsOnInsert: true },
      );
      reviewUpserts += 1;
    }

    // Recompute the denormalized rating aggregate (same as review.service).
    const [agg] = await Review.aggregate<{ avg: number; count: number }>([
      { $match: { venueId: venue._id } },
      { $group: { _id: null, avg: { $avg: '$stars' }, count: { $sum: 1 } } },
    ]);
    await Venue.updateOne(
      { _id: venue._id },
      { ratingAvg: Math.round((agg?.avg ?? 0) * 10) / 10, ratingCount: agg?.count ?? 0 },
    );
  }

  logger.info(
    { venues: venues.length, photoUpdates, reviewUpserts },
    `seeded media: photos + reviews on ${venues.length} venues`,
  );
  await disconnectDb();
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'media seed failed');
  process.exit(1);
});
