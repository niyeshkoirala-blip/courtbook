import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { addDays, nowNPT } from '@courtbook/shared';
import { createApp } from '../../app.js';
import { config } from '../../core/config.js';
import { connectDb, disconnectDb } from '../../core/db.js';
import { User } from '../users/user.model.js';
import { Venue } from '../venues/venue.model.js';
import { Court } from '../courts/court.model.js';
import { Booking } from '../bookings/booking.model.js';
import { Payment } from './payment.model.js';
import { Notification } from '../notifications/notification.model.js';

/** M4 acceptance suite (Phase 14): sandbox happy + replay + amount-tamper. */

const app = createApp();
let mongod: MongoMemoryServer;
const D2 = addDays(nowNPT().date, 2);

let venueId: string;
let noPayVenueId: string;
let courtId: string;
let ownerEmail: string;

let seq = 0;
async function makeUser(role: 'player' | 'owner' = 'player') {
  seq += 1;
  const user = await User.create({
    name: `Payer ${seq}`,
    email: `payer-${seq}@test.local`,
    passwordHash: 'x',
    role,
    emailVerifiedAt: new Date(),
  });
  return {
    id: user.id as string,
    email: user.email,
    token: jwt.sign({ sub: user.id as string, role }, config.jwtSecret),
  };
}

let slotSeq = 0;
/** Fresh pending hold, direct-inserted (engine covered by M3 suite). */
async function makeHold(userId: string, opts: Record<string, unknown> = {}) {
  slotSeq += 1;
  return Booking.create({
    courtId,
    venueId,
    userId,
    date: D2,
    startMin: 360 + slotSeq * 60,
    endMin: 420 + slotSeq * 60,
    status: 'pending_payment',
    price: 1500,
    channel: 'online',
    expiresAt: new Date(Date.now() + 10 * 60_000),
    ...opts,
  });
}

/** Forge an eSewa success payload signed with the sandbox secret. */
function esewaData(bookingId: string, totalAmount: string, tamper = false) {
  const payload: Record<string, string> = {
    transaction_code: `TXN-${bookingId.slice(-6)}-${totalAmount}`,
    status: 'COMPLETE',
    total_amount: totalAmount,
    transaction_uuid: bookingId,
    product_code: config.esewaProductCode,
    signed_field_names: 'total_amount,transaction_uuid,product_code',
  };
  const message = `total_amount=${payload.total_amount},transaction_uuid=${payload.transaction_uuid},product_code=${payload.product_code}`;
  payload.signature = createHmac('sha256', config.esewaSecret).update(message).digest('base64');
  if (tamper) payload.total_amount = '99999'; // altered AFTER signing
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
  await Booking.syncIndexes();
  await Payment.syncIndexes();

  const owner = await makeUser('owner');
  ownerEmail = owner.email;
  const venue = await Venue.create({
    ownerId: owner.id,
    name: 'Pay Arena',
    slug: 'pay-arena',
    area: 'Patan',
    status: 'approved',
    payAtVenue: true,
  });
  venueId = venue.id as string;
  const strict = await Venue.create({
    ownerId: owner.id,
    name: 'Online Only Arena',
    slug: 'online-only-arena',
    area: 'Patan',
    status: 'approved',
    payAtVenue: false,
  });
  noPayVenueId = strict.id as string;
  const court = await Court.create({
    venueId,
    name: 'Court P',
    surface: 'turf',
    size: '5v5',
    basePrice: 1500,
    slotMinutes: 60,
    schedule: Array.from({ length: 7 }, () => ({ openMin: 360, closeMin: 1260, closed: false })),
  });
  courtId = court.id as string;
});

afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /payments/initiate', () => {
  it('eSewa: returns a correctly signed form payload (§2.16)', async () => {
    const user = await makeUser();
    const hold = await makeHold(user.id);
    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ bookingId: hold.id, provider: 'esewa' })
      .expect(200);

    const { url, fields, paymentId } = res.body.data;
    expect(url).toBe(config.esewaFormUrl);
    expect(fields.transaction_uuid).toBe(hold.id);
    expect(fields.total_amount).toBe('1500');
    const expected = createHmac('sha256', config.esewaSecret)
      .update(
        `total_amount=1500,transaction_uuid=${hold.id},product_code=${config.esewaProductCode}`,
      )
      .digest('base64');
    expect(fields.signature).toBe(expected);
    expect(paymentId).toBeTruthy();
    expect((await Payment.findById(paymentId))?.status).toBe('initiated');
  });

  it('rejects foreign bookings (404), paid/expired holds (409)', async () => {
    const user = await makeUser();
    const stranger = await makeUser();
    const hold = await makeHold(user.id);

    await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ bookingId: hold.id, provider: 'esewa' })
      .expect(404);

    const dead = await makeHold(user.id, { expiresAt: new Date(Date.now() - 1000) });
    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ bookingId: dead.id, provider: 'esewa' })
      .expect(409);
    expect(res.body.error.code).toBe('INVALID_STATUS');
  });

  it('pay-at-venue: instant confirm with unpaid note when the venue allows (§6.1)', async () => {
    const user = await makeUser();
    const hold = await makeHold(user.id);
    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ bookingId: hold.id, provider: 'venue' })
      .expect(200);

    expect(res.body.data.bookingStatus).toBe('confirmed');
    expect((await Booking.findById(hold.id))?.status).toBe('confirmed');
    const email = await Notification.findOne({ to: user.email, templateId: 'booking_confirmed' });
    expect(email?.payload?.get('slot')).toMatch(/pay Rs 1500 at the venue/);
    expect(
      await Notification.findOne({ to: ownerEmail, templateId: 'booking_confirmed_owner' }),
    ).toBeTruthy();

    // a venue that requires online payment refuses provider=venue
    const strictHold = await makeHold(user.id, { venueId: noPayVenueId });
    await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ bookingId: strictHold.id, provider: 'venue' })
      .expect(422);
  });

  it('khalti: creates a session via the API and stores the pidx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ pidx: 'PIDX123', payment_url: 'https://khalti.test/pay/PIDX123' }),
      }),
    );
    const user = await makeUser();
    const hold = await makeHold(user.id);
    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ bookingId: hold.id, provider: 'khalti' })
      .expect(200);

    expect(res.body.data.url).toBe('https://khalti.test/pay/PIDX123');
    const payment = await Payment.findOne({ bookingId: hold.id });
    expect(payment?.providerTxnId).toBe('khalti:PIDX123');
    // amount was sent in paisa
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(JSON.parse((call[1] as { body: string }).body).amount).toBe(150000);
  });
});

describe('POST /payments/callback/esewa — the DoD gates', () => {
  it('HAPPY: verified signature + amount → booking confirmed + emails', async () => {
    const user = await makeUser();
    const hold = await makeHold(user.id);
    await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ bookingId: hold.id, provider: 'esewa' })
      .expect(200);

    const res = await request(app)
      .post('/api/v1/payments/callback/esewa')
      .send({ data: esewaData(hold.id, '1,500') }) // eSewa's comma format
      .expect(200);

    expect(res.body.data.status).toBe('verified');
    expect((await Booking.findById(hold.id))?.status).toBe('confirmed');
    expect(
      await Notification.findOne({ to: user.email, templateId: 'booking_confirmed' }),
    ).toBeTruthy();
  });

  it('REPLAY: same callback twice → idempotent 200, one payment, still confirmed', async () => {
    const user = await makeUser();
    const hold = await makeHold(user.id);
    await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ bookingId: hold.id, provider: 'esewa' })
      .expect(200);

    const data = esewaData(hold.id, '1500');
    await request(app).post('/api/v1/payments/callback/esewa').send({ data }).expect(200);
    const replay = await request(app)
      .post('/api/v1/payments/callback/esewa')
      .send({ data })
      .expect(200);

    expect(replay.body.data.status).toBe('verified');
    expect(await Payment.countDocuments({ bookingId: hold.id })).toBe(1);
    expect((await Booking.findById(hold.id))?.status).toBe('confirmed');
  });

  it('AMOUNT TAMPER: correctly signed but wrong amount → 400, booking stays pending', async () => {
    const user = await makeUser();
    const hold = await makeHold(user.id);
    await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ bookingId: hold.id, provider: 'esewa' })
      .expect(200);

    // signed over 100 — attacker paid Rs 100 for a Rs 1500 slot
    const res = await request(app)
      .post('/api/v1/payments/callback/esewa')
      .send({ data: esewaData(hold.id, '100') })
      .expect(400);

    expect(res.body.error.code).toBe('AMOUNT_MISMATCH');
    expect((await Booking.findById(hold.id))?.status).toBe('pending_payment');
    expect((await Payment.findOne({ bookingId: hold.id }))?.status).toBe('failed');
  });

  it('FORGED SIGNATURE: payload altered after signing → 400 SIGNATURE_INVALID', async () => {
    const user = await makeUser();
    const hold = await makeHold(user.id);
    await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ bookingId: hold.id, provider: 'esewa' })
      .expect(200);

    const res = await request(app)
      .post('/api/v1/payments/callback/esewa')
      .send({ data: esewaData(hold.id, '1500', true) })
      .expect(400);
    expect(res.body.error.code).toBe('SIGNATURE_INVALID');
    expect((await Booking.findById(hold.id))?.status).toBe('pending_payment');
  });

  it('LATE WEBHOOK (§6.5): expired booking is never force-confirmed', async () => {
    const user = await makeUser();
    const hold = await makeHold(user.id);
    await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ bookingId: hold.id, provider: 'esewa' })
      .expect(200);
    await Booking.updateOne({ _id: hold.id }, { status: 'expired' });

    const res = await request(app)
      .post('/api/v1/payments/callback/esewa')
      .send({ data: esewaData(hold.id, '1500') })
      .expect(200);

    expect(res.body.data.status).toBe('verified'); // money arrived — recorded for manual settling
    expect((await Booking.findById(hold.id))?.status).toBe('expired'); // slot NOT resurrected
  });
});

describe('POST /payments/callback/khalti', () => {
  async function khaltiHold() {
    const user = await makeUser();
    const hold = await makeHold(user.id);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ pidx: `PIDX-${hold.id}`, payment_url: 'https://khalti.test/pay' }),
      }),
    );
    await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ bookingId: hold.id, provider: 'khalti' })
      .expect(200);
    return { user, hold, pidx: `PIDX-${hold.id}` };
  }

  it('verifies via lookup and confirms (amounts in paisa)', async () => {
    const { hold, pidx } = await khaltiHold();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'Completed', total_amount: 150000, transaction_id: 'T1' }),
      }),
    );
    await request(app).post('/api/v1/payments/callback/khalti').send({ pidx }).expect(200);
    expect((await Booking.findById(hold.id))?.status).toBe('confirmed');
  });

  it('tampered amount → 400; unknown pidx → 404', async () => {
    const { hold, pidx } = await khaltiHold();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'Completed', total_amount: 9900 }),
      }),
    );
    const res = await request(app)
      .post('/api/v1/payments/callback/khalti')
      .send({ pidx })
      .expect(400);
    expect(res.body.error.code).toBe('AMOUNT_MISMATCH');
    expect((await Booking.findById(hold.id))?.status).toBe('pending_payment');

    await request(app)
      .post('/api/v1/payments/callback/khalti')
      .send({ pidx: 'PIDX-forged' })
      .expect(404);
  });
});

describe('GET /payments/:id', () => {
  it('lets the booking owner poll; strangers get 404', async () => {
    const user = await makeUser();
    const stranger = await makeUser();
    const hold = await makeHold(user.id);
    const init = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ bookingId: hold.id, provider: 'esewa' })
      .expect(200);

    const res = await request(app)
      .get(`/api/v1/payments/${init.body.data.paymentId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(res.body.data).toMatchObject({ provider: 'esewa', status: 'initiated', amount: 1500 });

    await request(app)
      .get(`/api/v1/payments/${init.body.data.paymentId}`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(404);
  });
});
