import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { connectDb, disconnectDb } from '../../core/db.js';
import { config } from '../../core/config.js';
import { User } from '../users/user.model.js';
import { Venue } from '../venues/venue.model.js';
import { Booking } from '../bookings/booking.model.js';
import { Notification } from '../notifications/notification.model.js';

/**
 * Owner-signup approval queue + admin provisioning (§3.5, §8 priv-escalation).
 * Covers: owner applies → gated → admin approves/rejects; admins mint admins;
 * non-admins are barred.
 */

const app = createApp();
let mongod: MongoMemoryServer;
const PASSWORD = 'correct-horse-9';

/** Seed a verified user straight into the DB (skips the email-verify dance). */
async function seedUser(email: string, role: 'player' | 'admin') {
  await User.create({
    name: `${role} ${email}`,
    email,
    passwordHash: await bcrypt.hash(PASSWORD, config.bcryptRounds),
    role,
    emailVerifiedAt: new Date(),
  });
}

function login(email: string) {
  return request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
}

async function tokenFor(email: string): Promise<string> {
  const res = await login(email).expect(200);
  return res.body.data.accessToken as string;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
  // Bootstrap the first admin directly — no admin exists yet to mint one.
  await seedUser('root@courtbook.local', 'admin');
});

afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

describe('owner approval queue', () => {
  it('an owner signup lands in the queue with no verify email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Owner One', email: 'owner1@x.com', password: PASSWORD, accountType: 'owner' })
      .expect(201);
    expect(res.body.data.user.role).toBe('player');
    expect(res.body.data.user.ownerRequest).toBe('pending');
    expect(
      await Notification.findOne({ to: 'owner1@x.com', templateId: 'verify_email' }),
    ).toBeNull();
  });

  it('a pending owner cannot log in', async () => {
    const res = await login('owner1@x.com').expect(403);
    expect(res.body.error.code).toBe('OWNER_PENDING');
  });

  it('admin sees the request, approves it, and the owner can then log in', async () => {
    const token = await tokenFor('root@courtbook.local');
    const list = await request(app)
      .get('/api/v1/admin/owner-requests')
      .set(auth(token))
      .expect(200);
    const applicant = list.body.data.find((u: { email: string }) => u.email === 'owner1@x.com');
    expect(applicant).toBeTruthy();

    const approved = await request(app)
      .post(`/api/v1/admin/owner-requests/${applicant.id}/approve`)
      .set(auth(token))
      .expect(200);
    expect(approved.body.data.role).toBe('owner');
    expect(approved.body.data.ownerRequest).toBeUndefined();

    const relogin = await login('owner1@x.com').expect(200);
    expect(relogin.body.data.user.role).toBe('owner');
  });

  it('rejecting a request blocks login with a distinct code', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Owner Two', email: 'owner2@x.com', password: PASSWORD, accountType: 'owner' })
      .expect(201);
    const token = await tokenFor('root@courtbook.local');
    const list = await request(app)
      .get('/api/v1/admin/owner-requests')
      .set(auth(token))
      .expect(200);
    const applicant = list.body.data.find((u: { email: string }) => u.email === 'owner2@x.com');

    await request(app)
      .post(`/api/v1/admin/owner-requests/${applicant.id}/reject`)
      .set(auth(token))
      .send({ reason: 'Incomplete venue details' })
      .expect(200);

    const res = await login('owner2@x.com').expect(403);
    expect(res.body.error.code).toBe('OWNER_REJECTED');
  });
});

describe('admin provisioning', () => {
  it('an admin can mint another admin who can log in immediately', async () => {
    const token = await tokenFor('root@courtbook.local');
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set(auth(token))
      .send({ name: 'Second Admin', email: 'admin2@x.com', password: PASSWORD })
      .expect(201);
    expect(res.body.data.role).toBe('admin');

    const relogin = await login('admin2@x.com').expect(200);
    expect(relogin.body.data.user.role).toBe('admin');
  });

  it('non-admins are barred from every admin route', async () => {
    await seedUser('player@x.com', 'player');
    const token = await tokenFor('player@x.com');
    await request(app).get('/api/v1/admin/owner-requests').set(auth(token)).expect(403);
    await request(app)
      .post('/api/v1/admin/users')
      .set(auth(token))
      .send({ name: 'X', email: 'x@x.com', password: PASSWORD })
      .expect(403);
  });
});

describe('futsal management & platform stats', () => {
  it('reports platform totals, lists every futsal, and removes one', async () => {
    const owner = await User.create({
      name: 'Venue Owner',
      email: 'venueowner@x.com',
      passwordHash: await bcrypt.hash(PASSWORD, config.bcryptRounds),
      role: 'owner',
      emailVerifiedAt: new Date(),
    });
    const venue = await Venue.create({
      ownerId: owner._id,
      name: 'Test Futsal',
      slug: `test-futsal-${Date.now()}`,
      area: 'Testville',
      status: 'approved',
    });
    // A confirmed booking → counts toward bookings + revenue.
    await Booking.create({
      courtId: new Types.ObjectId(),
      venueId: venue._id,
      date: '2026-07-01',
      startMin: 600,
      endMin: 660,
      status: 'confirmed',
      price: 1500,
      channel: 'online',
    });

    const token = await tokenFor('root@courtbook.local');

    const stats = await request(app).get('/api/v1/admin/stats').set(auth(token)).expect(200);
    expect(stats.body.data.venues).toBe(1);
    expect(stats.body.data.bookings).toBe(1);
    expect(stats.body.data.revenue).toBe(1500);

    const list = await request(app).get('/api/v1/admin/venues/all').set(auth(token)).expect(200);
    expect(list.body.data.some((v: { id: string }) => v.id === String(venue._id))).toBe(true);

    await request(app).delete(`/api/v1/admin/venues/${venue._id}`).set(auth(token)).expect(204);

    const after = await request(app).get('/api/v1/admin/venues/all').set(auth(token)).expect(200);
    expect(after.body.data.some((v: { id: string }) => v.id === String(venue._id))).toBe(false);
    const stats2 = await request(app).get('/api/v1/admin/stats').set(auth(token)).expect(200);
    expect(stats2.body.data.venues).toBe(0);
  });
});
