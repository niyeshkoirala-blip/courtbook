import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { config } from '../../core/config.js';
import { connectDb, disconnectDb } from '../../core/db.js';
import { User } from '../users/user.model.js';
import { Venue } from '../venues/venue.model.js';
import { Booking } from '../bookings/booking.model.js';

/** Reviews: booked-players-only gate, upsert dedupe, denormalized rating. */

const app = createApp();
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});

afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

let seq = 0;
async function makeUser(name = 'Review Tester') {
  seq += 1;
  const user = await User.create({
    name,
    email: `review-user-${seq}@test.local`,
    passwordHash: 'irrelevant',
    role: 'player',
    emailVerifiedAt: new Date(),
  });
  return {
    id: user.id as string,
    token: jwt.sign({ sub: user.id as string, role: 'player' }, config.jwtSecret),
  };
}

/** Direct-insert an approved venue — the review gate only cares about status. */
async function makeVenue() {
  seq += 1;
  const owner = await makeUser('Owner');
  return Venue.create({
    ownerId: owner.id,
    name: `Review Arena ${seq}`,
    slug: `review-arena-${seq}`,
    area: 'Baneshwor',
    status: 'approved',
  });
}

/** Minimal confirmed booking so the user passes the "has booked" gate. */
async function makeBooking(venueId: string, userId: string) {
  seq += 1;
  return Booking.create({
    courtId: venueId, // ponytail: any valid ObjectId — the gate matches on venueId+userId
    venueId,
    userId,
    date: '2026-07-01',
    startMin: 1080 + seq * 60, // avoid the uniqueness index between tests
    endMin: 1140 + seq * 60,
    price: 1500,
    status: 'confirmed',
    channel: 'online',
  });
}

describe('venue reviews', () => {
  it('rejects a review from a user who never booked the venue', async () => {
    const venue = await makeVenue();
    const user = await makeUser();
    const res = await request(app)
      .post(`/api/v1/venues/${venue.id}/reviews`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ stars: 5 })
      .expect(403);
    expect(res.body.error.code).toBe('REVIEW_NOT_ALLOWED');
  });

  it('accepts a review from a booked user and denormalizes the rating', async () => {
    const venue = await makeVenue();
    const user = await makeUser('Star Giver');
    await makeBooking(venue.id as string, user.id);

    const res = await request(app)
      .post(`/api/v1/venues/${venue.id}/reviews`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ stars: 4, comment: 'Great turf' })
      .expect(200);
    expect(res.body.data).toMatchObject({
      stars: 4,
      comment: 'Great turf',
      userName: 'Star Giver',
    });

    const updated = await Venue.findById(venue.id);
    expect(updated?.ratingAvg).toBe(4);
    expect(updated?.ratingCount).toBe(1);
  });

  it('re-submitting replaces the review instead of duplicating it', async () => {
    const venue = await makeVenue();
    const user = await makeUser();
    await makeBooking(venue.id as string, user.id);
    const put = (stars: number) =>
      request(app)
        .post(`/api/v1/venues/${venue.id}/reviews`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stars })
        .expect(200);
    await put(2);
    await put(5);

    const list = await request(app).get(`/api/v1/venues/${venue.id}/reviews`).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].stars).toBe(5);
    const updated = await Venue.findById(venue.id);
    expect(updated?.ratingAvg).toBe(5);
    expect(updated?.ratingCount).toBe(1);
  });

  it('averages across multiple reviewers', async () => {
    const venue = await makeVenue();
    for (const stars of [5, 2]) {
      const user = await makeUser();
      await makeBooking(venue.id as string, user.id);
      await request(app)
        .post(`/api/v1/venues/${venue.id}/reviews`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stars })
        .expect(200);
    }
    const updated = await Venue.findById(venue.id);
    expect(updated?.ratingAvg).toBe(3.5);
    expect(updated?.ratingCount).toBe(2);
  });
});
