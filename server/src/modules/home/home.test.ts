import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { connectDb, disconnectDb } from '../../core/db.js';
import { Venue } from '../venues/venue.model.js';
import { Court } from '../courts/court.model.js';
import { Booking } from '../bookings/booking.model.js';

/** GET /home — the public landing summary reflects real DB counts + availability. */

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

describe('GET /home', () => {
  it('empty DB → zero counts, no tonight rows, 6 hourly labels', async () => {
    const res = await request(app).get('/api/v1/home').expect(200);
    expect(res.body.data.stats).toEqual({ courts: 0, bookings: 0 });
    expect(res.body.data.tonight.courts).toEqual([]);
    expect(res.body.data.tonight.labels).toHaveLength(6);
    expect(res.body.data.owner).toBeNull();
    expect(res.body.data.recentBooking).toBeNull();
  });

  it('counts active courts and lists one row per approved venue', async () => {
    const venue = await Venue.create({
      ownerId: '6a538f808a10e3a0ed515b36',
      name: 'Home Test Arena',
      slug: 'home-test-arena',
      area: 'Baneshwor',
      status: 'approved',
      payAtVenue: true,
    });
    await Court.create({
      venueId: venue.id,
      name: 'Court 1',
      surface: 'turf',
      size: '5v5',
      basePrice: 1500,
      slotMinutes: 60,
      schedule: Array.from({ length: 7 }, () => ({ openMin: 360, closeMin: 1320, closed: false })),
      priceOverrides: [],
    });
    // a draft venue must NOT surface on the public landing page
    await Venue.create({
      ownerId: '6a538f808a10e3a0ed515b36',
      name: 'Hidden Draft',
      slug: 'hidden-draft',
      area: 'Patan',
      status: 'draft',
      payAtVenue: true,
    });

    const res = await request(app).get('/api/v1/home').expect(200);
    expect(res.body.data.stats.courts).toBe(1);
    expect(res.body.data.tonight.courts).toHaveLength(1);
    const row = res.body.data.tonight.courts[0];
    expect(row).toMatchObject({ venueName: 'Home Test Arena', area: 'Baneshwor' });
    expect(row.cells).toHaveLength(6);
  });

  it('owner snapshot picks the top-earning approved venue', async () => {
    const court = await Court.findOne({});
    // two confirmed bookings on a past date → earnings, not "today" activity
    await Booking.create([
      {
        courtId: court!._id,
        venueId: court!.venueId,
        date: '2026-01-02',
        startMin: 1080,
        endMin: 1140,
        status: 'confirmed',
        price: 2000,
        channel: 'online',
      },
      {
        courtId: court!._id,
        venueId: court!.venueId,
        date: '2026-01-03',
        startMin: 1080,
        endMin: 1140,
        status: 'confirmed',
        price: 1500,
        channel: 'walk_in',
      },
    ]);

    const res = await request(app).get('/api/v1/home').expect(200);
    expect(res.body.data.owner).toMatchObject({
      venueName: 'Home Test Arena',
      area: 'Baneshwor',
      bookings: 2,
      earnings: 3500,
    });
    expect(res.body.data.recentBooking).toMatchObject({ venueName: 'Home Test Arena' });
    expect(res.body.data.stats.bookings).toBe(2);
  });
});
