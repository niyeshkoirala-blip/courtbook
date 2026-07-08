import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, nowNPT } from '@courtbook/shared';
import { createApp } from '../../app.js';
import { config } from '../../core/config.js';
import { connectDb, disconnectDb } from '../../core/db.js';
import { User } from '../users/user.model.js';
import { Venue } from '../venues/venue.model.js';
import { Court } from '../courts/court.model.js';
import { Booking } from '../bookings/booking.model.js';

/** M6 acceptance: owner dashboard reads — ownership, customer visibility, stats math. */

const app = createApp();
let mongod: MongoMemoryServer;
const TODAY = nowNPT().date;

let ownerToken: string;
let strangerToken: string;
let venueId: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());

  const owner = await User.create({
    name: 'Dash Owner',
    email: 'dash-owner@test.local',
    passwordHash: 'x',
    role: 'owner',
    emailVerifiedAt: new Date(),
  });
  const stranger = await User.create({
    name: 'Other Owner',
    email: 'dash-stranger@test.local',
    passwordHash: 'x',
    role: 'owner',
    emailVerifiedAt: new Date(),
  });
  ownerToken = jwt.sign({ sub: owner.id as string, role: 'owner' }, config.jwtSecret);
  strangerToken = jwt.sign({ sub: stranger.id as string, role: 'owner' }, config.jwtSecret);

  const venue = await Venue.create({
    ownerId: owner.id,
    name: 'Dash Arena',
    slug: 'dash-arena',
    area: 'Jawalakhel',
    status: 'approved',
  });
  venueId = venue.id as string;
  const court = await Court.create({
    venueId,
    name: 'Court D',
    surface: 'turf',
    size: '5v5',
    basePrice: 1000,
    slotMinutes: 60,
    // open 4h/day → easy occupancy math: 06:00–10:00
    schedule: Array.from({ length: 7 }, () => ({ openMin: 360, closeMin: 600, closed: false })),
  });

  // today: one confirmed walk-in (revenue) + one pending hold (occupies, no revenue)
  await Booking.create([
    {
      courtId: court.id,
      venueId,
      date: TODAY,
      startMin: 360,
      endMin: 420,
      status: 'confirmed',
      price: 1000,
      channel: 'walk_in',
      customer: { name: 'Walkin Kumar', phone: '9800000011' },
    },
    {
      courtId: court.id,
      venueId,
      userId: owner.id,
      date: TODAY,
      startMin: 420,
      endMin: 480,
      status: 'pending_payment',
      price: 1000,
      channel: 'online',
      expiresAt: new Date(Date.now() + 600_000),
    },
    {
      courtId: court.id,
      venueId,
      userId: owner.id,
      date: addDays(TODAY, 1),
      startMin: 360,
      endMin: 420,
      status: 'confirmed',
      price: 1000,
      channel: 'online',
    },
    {
      // cancelled — must not count anywhere
      courtId: court.id,
      venueId,
      userId: owner.id,
      date: TODAY,
      startMin: 480,
      endMin: 540,
      status: 'cancelled',
      price: 1000,
      channel: 'online',
    },
  ]);
});

afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

describe('GET /owner/venues', () => {
  it('lists own venues (all statuses), not others', async () => {
    const res = await request(app)
      .get('/api/v1/owner/venues')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.data.map((v: { name: string }) => v.name)).toEqual(['Dash Arena']);

    const other = await request(app)
      .get('/api/v1/owner/venues')
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(200);
    expect(other.body.data).toHaveLength(0);
  });
});

describe('GET /owner/venues/:id/bookings', () => {
  it("today's bookings with walk-in customer details (§7.5), cancelled excluded", async () => {
    const res = await request(app)
      .get(`/api/v1/owner/venues/${venueId}/bookings`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(2); // confirmed + pending, not cancelled/tomorrow
    const walkin = res.body.data.find((b: { channel: string }) => b.channel === 'walk_in');
    expect(walkin.customer).toEqual({ name: 'Walkin Kumar', phone: '9800000011' });
    expect(walkin.courtName).toBe('Court D');
  });

  it('foreign owners get 404; bad range 422', async () => {
    await request(app)
      .get(`/api/v1/owner/venues/${venueId}/bookings`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(404);
    await request(app)
      .get(`/api/v1/owner/venues/${venueId}/bookings?from=2026-09-02&to=2026-09-01`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(422);
  });
});

describe('GET /owner/venues/:id/stats', () => {
  it('computes revenue, bookings and occupancy over the range', async () => {
    const res = await request(app)
      .get(`/api/v1/owner/venues/${venueId}/stats?from=${TODAY}&to=${addDays(TODAY, 1)}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    // 2 confirmed bookings (walk-in today + online tomorrow); pending/cancelled excluded
    expect(res.body.data.totalBookings).toBe(2);
    expect(res.body.data.revenue).toBe(2000);
    // booked 2h of 8h open (4h/day × 2 days) = 25%
    expect(res.body.data.occupancyPct).toBe(25);
    expect(res.body.data.perDay).toHaveLength(2);
    expect(res.body.data.perDay[0]).toMatchObject({ date: TODAY, bookings: 1, revenue: 1000 });
  });
});
