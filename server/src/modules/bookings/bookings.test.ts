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
import { Booking } from './booking.model.js';
import { Block } from './block.model.js';
import { Notification } from '../notifications/notification.model.js';
import { sweepExpiredHolds } from '../../jobs/expiry-sweeper.js';

/** M3 acceptance suite — the booking engine (§7.1–§7.4, §11.5 race gate). */

const app = createApp();
let mongod: MongoMemoryServer;

const TODAY = nowNPT().date;
const D1 = addDays(TODAY, 1);
const D2 = addDays(TODAY, 2);
const D3 = addDays(TODAY, 3);

let ownerToken: string;
let ownerId: string;
let venueId: string;
let courtId: string;

let seq = 0;
async function makeUser(role: 'player' | 'owner' | 'admin' = 'player') {
  seq += 1;
  const user = await User.create({
    name: `Booker ${seq}`,
    email: `booker-${seq}@test.local`,
    passwordHash: 'irrelevant',
    role,
    emailVerifiedAt: new Date(),
  });
  return {
    id: user.id as string,
    email: user.email,
    token: jwt.sign({ sub: user.id as string, role }, config.jwtSecret),
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
  // the sacred partial unique index must exist before any race test
  await Booking.syncIndexes();

  const owner = await makeUser('owner');
  ownerToken = owner.token;
  ownerId = owner.id;
  const venue = await Venue.create({
    ownerId: owner.id,
    name: 'Engine Test Arena',
    slug: 'engine-test-arena',
    area: 'Kupondole',
    status: 'approved',
    payAtVenue: true,
  });
  venueId = venue.id as string;
  const court = await Court.create({
    venueId,
    name: 'Court X',
    surface: 'turf',
    size: '5v5',
    basePrice: 1500,
    slotMinutes: 60,
    schedule: Array.from({ length: 7 }, () => ({ openMin: 360, closeMin: 1260, closed: false })),
    priceOverrides: [{ startMin: 1020, endMin: 1260, price: 2000 }],
  });
  courtId = court.id as string;
});

afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

function book(token: string, body: Record<string, unknown>) {
  return request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ courtId, ...body });
}

describe('GET /courts/:id/availability', () => {
  it('derives slots from the schedule with §7.2 prices', async () => {
    const res = await request(app)
      .get(`/api/v1/courts/${courtId}/availability?from=${D1}&days=2`)
      .expect(200);
    const [day1] = res.body.data;
    expect(res.body.data).toHaveLength(2);
    expect(day1.closed).toBe(false);
    expect(day1.slots).toHaveLength(15); // 06:00–21:00, 60-min grid
    const morning = day1.slots.find((s: { startMin: number }) => s.startMin === 600);
    const evening = day1.slots.find((s: { startMin: number }) => s.startMin === 1080);
    expect(morning).toMatchObject({ state: 'available', price: 1500 });
    expect(evening).toMatchObject({ state: 'available', price: 2000 }); // override window
  });

  it('rejects windows beyond 14 days (422)', async () => {
    await request(app).get(`/api/v1/courts/${courtId}/availability?days=15`).expect(422);
  });
});

describe('POST /bookings — the atomic engine (§7.3)', () => {
  it('creates a 10-min pending hold with snapshotted price + payment options', async () => {
    const user = await makeUser();
    const res = await book(user.token, { date: D1, startMin: 600 }).expect(201);

    expect(res.body.data).toMatchObject({
      status: 'pending_payment',
      price: 1500,
      channel: 'online',
      paymentOptions: ['esewa', 'khalti', 'venue'], // payAtVenue on
    });
    const msLeft = new Date(res.body.data.expiresAt).getTime() - Date.now();
    expect(msLeft).toBeGreaterThan(9 * 60_000);
    expect(msLeft).toBeLessThanOrEqual(10 * 60_000);

    // grid now shows it taken
    const avail = await request(app)
      .get(`/api/v1/courts/${courtId}/availability?from=${D1}&days=1`)
      .expect(200);
    const slot = avail.body.data[0].slots.find((s: { startMin: number }) => s.startMin === 600);
    expect(slot.state).toBe('taken');
  });

  it('409 SLOT_TAKEN with same-day alternatives on double booking', async () => {
    const user = await makeUser();
    const res = await book(user.token, { date: D1, startMin: 600 }).expect(409);
    expect(res.body.error.code).toBe('SLOT_TAKEN');
    expect(res.body.error.details.alternatives.length).toBeGreaterThan(0);
    expect(res.body.error.details.alternatives[0].startMin).not.toBe(600);
  });

  it('422 SLOT_INVALID: misaligned, out-of-hours, past, too far ahead', async () => {
    const user = await makeUser();
    for (const attempt of [
      { date: D1, startMin: 615 }, // off-grid
      { date: D1, startMin: 300 }, // before opening
      { date: addDays(TODAY, -1), startMin: 600 }, // past
      { date: addDays(TODAY, 15), startMin: 600 }, // beyond window
    ]) {
      const res = await book(user.token, attempt).expect(422);
      expect(res.body.error.code).toBe('SLOT_INVALID');
    }
  });

  it('422 on blocked slots', async () => {
    await Block.create({
      courtId,
      date: D3,
      startMin: 600,
      endMin: 720,
      reason: 'maintenance',
      createdBy: ownerId,
    });
    const user = await makeUser();
    const res = await book(user.token, { date: D3, startMin: 660 }).expect(422);
    expect(res.body.error.message).toMatch(/blocked/i);
    const avail = await request(app)
      .get(`/api/v1/courts/${courtId}/availability?from=${D3}&days=1`)
      .expect(200);
    const s600 = avail.body.data[0].slots.find((s: { startMin: number }) => s.startMin === 600);
    expect(s600.state).toBe('blocked');
  });

  it('idempotencyKey: repeat POST returns the original booking (§4.5)', async () => {
    const user = await makeUser();
    const key = 'client-key-abc12345';
    const first = await book(user.token, { date: D1, startMin: 720, idempotencyKey: key }).expect(
      201,
    );
    const second = await book(user.token, { date: D1, startMin: 720, idempotencyKey: key }).expect(
      201,
    );
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await Booking.countDocuments({ userId: user.id })).toBe(1);
  });

  it('429 TOO_MANY_HOLDS after 3 simultaneous unpaid holds (§7.1)', async () => {
    const user = await makeUser();
    for (const startMin of [780, 840, 900]) {
      await book(user.token, { date: D1, startMin }).expect(201);
    }
    const res = await book(user.token, { date: D1, startMin: 960 }).expect(429);
    expect(res.body.error.code).toBe('TOO_MANY_HOLDS');
  });

  it('RACE GATE: 40 concurrent users, one slot → exactly one 201 (§11.5)', async () => {
    const users = await Promise.all(Array.from({ length: 40 }, () => makeUser()));
    const results = await Promise.all(users.map((u) => book(u.token, { date: D2, startMin: 600 })));
    const codes = results.map((r) => r.status);
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(39);
    expect(
      await Booking.countDocuments({ date: D2, startMin: 600, status: 'pending_payment' }),
    ).toBe(1);
  });
});

describe('cancellation (§7.4, §6.2)', () => {
  it('>24h cancel refunds 100%, reopens the slot, emails both sides', async () => {
    const user = await makeUser();
    const created = await book(user.token, { date: D2, startMin: 1080 }).expect(201);
    const res = await request(app)
      .post(`/api/v1/bookings/${created.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ reason: 'rain' })
      .expect(200);
    expect(res.body.data.cancellation).toMatchObject({
      refundPct: 100,
      by: 'player',
      reason: 'rain',
    });

    // partial index released the slot → instantly rebookable
    const other = await makeUser();
    await book(other.token, { date: D2, startMin: 1080 }).expect(201);

    expect(
      await Notification.findOne({ to: user.email, templateId: 'booking_cancelled' }),
    ).toBeTruthy();
    const owner = await User.findById(ownerId);
    expect(
      await Notification.findOne({ to: owner!.email, templateId: 'booking_cancelled_owner' }),
    ).toBeTruthy();
  });

  it('409 TOO_LATE_TO_CANCEL once the slot has started', async () => {
    const user = await makeUser();
    const stale = await Booking.create({
      courtId,
      venueId,
      userId: user.id,
      date: addDays(TODAY, -1),
      startMin: 600,
      endMin: 660,
      status: 'confirmed',
      price: 1500,
      channel: 'online',
    });
    const res = await request(app)
      .post(`/api/v1/bookings/${stale.id}/cancel`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(409);
    expect(res.body.error.code).toBe('TOO_LATE_TO_CANCEL');
  });

  it("strangers can't cancel or read someone else's booking (404)", async () => {
    const user = await makeUser();
    const stranger = await makeUser();
    const created = await book(user.token, { date: D3, startMin: 780 }).expect(201);
    await request(app)
      .post(`/api/v1/bookings/${created.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(404);
    await request(app)
      .get(`/api/v1/bookings/${created.body.data.id}`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(404);
    // …but the venue owner can read it (§4.4)
    const asOwner = await request(app)
      .get(`/api/v1/bookings/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(asOwner.body.data.venueName).toBe('Engine Test Arena');
  });
});

describe('expiry sweeper (§2.10)', () => {
  it('expires stale holds, frees the slot, queues the email', async () => {
    const user = await makeUser();
    await Booking.create({
      courtId,
      venueId,
      userId: user.id,
      date: D3,
      startMin: 900,
      endMin: 960,
      status: 'pending_payment',
      price: 1500,
      channel: 'online',
      expiresAt: new Date(Date.now() - 60_000), // already past
    });
    const swept = await sweepExpiredHolds();
    expect(swept).toBeGreaterThanOrEqual(1);

    const rebooker = await makeUser();
    await book(rebooker.token, { date: D3, startMin: 900 }).expect(201); // slot free again
    expect(await Notification.findOne({ to: user.email, templateId: 'hold_expired' })).toBeTruthy();
  });
});

describe('walk-ins & blocks (owner ops)', () => {
  it('walk-in books through the same atomic path, instantly confirmed', async () => {
    const res = await request(app)
      .post('/api/v1/owner/bookings/walkin')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        courtId,
        date: D3,
        startMin: 1080,
        customer: { name: 'Walk In Guy', phone: '9800000001' },
      })
      .expect(201);
    expect(res.body.data).toMatchObject({ status: 'confirmed', channel: 'walk_in' });

    // same slot again → loses the race like anyone else (§3.4)
    await request(app)
      .post('/api/v1/owner/bookings/walkin')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ courtId, date: D3, startMin: 1080 })
      .expect(409);

    // non-owner can't walk-in on this venue
    const other = await makeUser('owner');
    await request(app)
      .post('/api/v1/owner/bookings/walkin')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ courtId, date: D3, startMin: 1140 })
      .expect(404);
  });

  it('blocks refuse to swallow existing bookings (409 + conflict list)', async () => {
    const res = await request(app)
      .post('/api/v1/owner/blocks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ courtId, date: D3, startMin: 1050, endMin: 1140, reason: 'tournament' })
      .expect(409); // overlaps the walk-in at 1080
    expect(res.body.error.code).toBe('HAS_BOOKINGS');
    expect(res.body.error.details.conflicts).toHaveLength(1);

    // clean range works, then delete frees it
    const created = await request(app)
      .post('/api/v1/owner/blocks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ courtId, date: D3, startMin: 360, endMin: 480, reason: 'cleaning' })
      .expect(201);
    await request(app)
      .delete(`/api/v1/owner/blocks/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
  });
});

describe('GET /me/bookings', () => {
  it('lists own bookings with status filter and cursor pagination', async () => {
    const user = await makeUser();
    for (const startMin of [420, 480, 540]) {
      await book(user.token, { date: D2, startMin }).expect(201);
    }
    const auth = ['Authorization', `Bearer ${user.token}`] as const;

    const all = await request(app)
      .get('/api/v1/me/bookings')
      .set(...auth)
      .expect(200);
    expect(all.body.data).toHaveLength(3);
    expect(all.body.data[0].venueName).toBe('Engine Test Arena');

    const filtered = await request(app)
      .get('/api/v1/me/bookings?status=cancelled')
      .set(...auth)
      .expect(200);
    expect(filtered.body.data).toHaveLength(0);

    const page1 = await request(app)
      .get('/api/v1/me/bookings?limit=2')
      .set(...auth)
      .expect(200);
    expect(page1.body.data).toHaveLength(2);
    const page2 = await request(app)
      .get(`/api/v1/me/bookings?limit=2&cursor=${page1.body.meta.nextCursor}`)
      .set(...auth)
      .expect(200);
    expect(page2.body.data).toHaveLength(1);
  });
});
