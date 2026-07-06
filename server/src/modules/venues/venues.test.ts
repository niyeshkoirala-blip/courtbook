import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { config } from '../../core/config.js';
import { connectDb, disconnectDb } from '../../core/db.js';
import { User } from '../users/user.model.js';
import { Venue } from './venue.model.js';
import { AuditLog } from '../admin/audit.model.js';
import { Notification } from '../notifications/notification.model.js';

/** M2 acceptance suite: venue/court CRUD, visibility, approval, search. */

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

let emailSeq = 0;
/** Direct-insert user + signed JWT — auth flows are already covered in auth.test. */
async function makeUser(role: 'player' | 'owner' | 'admin' = 'player') {
  emailSeq += 1;
  const user = await User.create({
    name: 'Venue Tester',
    email: `venue-user-${emailSeq}@test.local`,
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

const openAllWeek = Array.from({ length: 7 }, () => ({
  openMin: 360,
  closeMin: 1260,
  closed: false,
}));

function venueInput(name: string, extra: Record<string, unknown> = {}) {
  return { name, area: 'Baneshwor', description: 'Nice turf', ...extra };
}

function courtInput(extra: Record<string, unknown> = {}) {
  return {
    name: 'Court A',
    surface: 'turf',
    size: '5v5',
    basePrice: 1500,
    schedule: openAllWeek,
    ...extra,
  };
}

/** Full happy path: create venue + court, publish, approve. Returns ids + owner. */
async function approvedVenue(name: string, courtExtra: Record<string, unknown> = {}) {
  const owner = await makeUser();
  const vRes = await request(app)
    .post('/api/v1/venues')
    .set('Authorization', `Bearer ${owner.token}`)
    .send(venueInput(name))
    .expect(201);
  const venueId = vRes.body.data.id as string;
  await request(app)
    .post(`/api/v1/venues/${venueId}/courts`)
    .set('Authorization', `Bearer ${owner.token}`)
    .send(courtInput(courtExtra))
    .expect(201);
  await request(app)
    .post(`/api/v1/venues/${venueId}/publish`)
    .set('Authorization', `Bearer ${owner.token}`)
    .expect(200);
  const admin = await makeUser('admin');
  await request(app)
    .post(`/api/v1/admin/venues/${venueId}/approve`)
    .set('Authorization', `Bearer ${admin.token}`)
    .expect(200);
  return { owner, venueId, slug: vRes.body.data.slug as string };
}

describe('venue creation & ownership', () => {
  it('creates a draft venue and upgrades the player to owner', async () => {
    const user = await makeUser('player');
    const res = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${user.token}`)
      .send(venueInput('Kick Off Arena', { geo: { lat: 27.69, lng: 85.34 } }))
      .expect(201);

    expect(res.body.data).toMatchObject({
      status: 'draft',
      slug: 'kick-off-arena',
      geo: { lat: 27.69, lng: 85.34 },
    });
    const dbUser = await User.findById(user.id);
    expect(dbUser?.role).toBe('owner');
  });

  it('generates distinct slugs for duplicate names', async () => {
    const user = await makeUser();
    const first = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${user.token}`)
      .send(venueInput('Same Name FC'))
      .expect(201);
    const second = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${user.token}`)
      .send(venueInput('Same Name FC'))
      .expect(201);
    expect(second.body.data.slug).not.toBe(first.body.data.slug);
    expect(second.body.data.slug).toMatch(/^same-name-fc-[0-9a-f]{4}$/);
  });

  it('422 on invalid input; 401 unauthenticated', async () => {
    const user = await makeUser();
    await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'ab', area: 'x' })
      .expect(422);
    await request(app).post('/api/v1/venues').send(venueInput('No Auth Arena')).expect(401);
  });

  it("foreign owners get 404 (not 403) on someone else's venue", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const res = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(venueInput('Private Grounds'))
      .expect(201);
    await request(app)
      .patch(`/api/v1/venues/${res.body.data.id}`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({ description: 'hijacked' })
      .expect(404);
  });
});

describe('visibility (§7.5)', () => {
  it('draft venues: hidden publicly, visible to their owner', async () => {
    const owner = await makeUser();
    const res = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(venueInput('Hidden Draft Arena'))
      .expect(201);
    const slug = res.body.data.slug as string;

    await request(app).get(`/api/v1/venues/${slug}`).expect(404);
    const ownerView = await request(app)
      .get(`/api/v1/venues/${slug}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(ownerView.body.data.venue.status).toBe('draft');

    const list = await request(app).get('/api/v1/venues').expect(200);
    const names = (list.body.data as { name: string }[]).map((v) => v.name);
    expect(names).not.toContain('Hidden Draft Arena');
  });
});

describe('courts', () => {
  it('validates schedule and pricing (§5.2 rules)', async () => {
    const owner = await makeUser();
    const vRes = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(venueInput('Court Rules Arena'))
      .expect(201);
    const base = `/api/v1/venues/${vRes.body.data.id}/courts`;
    const auth = ['Authorization', `Bearer ${owner.token}`] as const;

    // openMin >= closeMin
    const badDay = [{ openMin: 900, closeMin: 300, closed: false }, ...openAllWeek.slice(1)];
    await request(app)
      .post(base)
      .set(...auth)
      .send(courtInput({ schedule: badDay }))
      .expect(422);
    // price out of range
    await request(app)
      .post(base)
      .set(...auth)
      .send(courtInput({ basePrice: 50 }))
      .expect(422);
    // override outside open hours
    await request(app)
      .post(base)
      .set(...auth)
      .send(courtInput({ priceOverrides: [{ startMin: 100, endMin: 500, price: 2000 }] }))
      .expect(422);
    // valid court with an evening override
    const res = await request(app)
      .post(base)
      .set(...auth)
      .send(courtInput({ priceOverrides: [{ startMin: 1020, endMin: 1260, price: 2000 }] }))
      .expect(201);
    expect(res.body.data).toMatchObject({ basePrice: 1500, slotMinutes: 60, active: true });
  });

  it('soft-deletes a court (204) and hides it from the venue page', async () => {
    const { owner, venueId, slug } = await approvedVenue('Delete Court Arena');
    const created = await request(app)
      .post(`/api/v1/venues/${venueId}/courts`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send(courtInput({ name: 'Court B' }))
      .expect(201);
    await request(app)
      .delete(`/api/v1/venues/${venueId}/courts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204);
    const page = await request(app).get(`/api/v1/venues/${slug}`).expect(200);
    const courtNames = (page.body.data.courts as { name: string }[]).map((c) => c.name);
    expect(courtNames).not.toContain('Court B');
  });
});

describe('publish → review → approve/reject', () => {
  it('blocks publishing without a court (422 NO_COURTS)', async () => {
    const owner = await makeUser();
    const res = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(venueInput('Empty Venue'))
      .expect(201);
    const pub = await request(app)
      .post(`/api/v1/venues/${res.body.data.id}/publish`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(422);
    expect(pub.body.error.code).toBe('NO_COURTS');
  });

  it('full approval: queue → approve → public + email + audit', async () => {
    const { owner, slug, venueId } = await approvedVenue('Approval Flow Arena');

    await request(app).get(`/api/v1/venues/${slug}`).expect(200);
    expect(
      await Notification.findOne({ to: owner.email, templateId: 'venue_approved' }),
    ).toBeTruthy();
    const audit = await AuditLog.findOne({ action: 'venue.approve', targetId: venueId });
    expect(audit).toBeTruthy();
  });

  it('admin queue is admin-only (403 for owners)', async () => {
    const owner = await makeUser('owner');
    await request(app)
      .get('/api/v1/admin/venues')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(403);
  });

  it('reject stores the reason and emails the owner', async () => {
    const owner = await makeUser();
    const admin = await makeUser('admin');
    const vRes = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(venueInput('Reject Me Arena'))
      .expect(201);
    const venueId = vRes.body.data.id as string;
    await request(app)
      .post(`/api/v1/venues/${venueId}/courts`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send(courtInput())
      .expect(201);
    await request(app)
      .post(`/api/v1/venues/${venueId}/publish`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    const rej = await request(app)
      .post(`/api/v1/admin/venues/${venueId}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reason: 'Photos are blurry' })
      .expect(200);
    expect(rej.body.data).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Photos are blurry',
    });
    expect(
      await Notification.findOne({ to: owner.email, templateId: 'venue_rejected' }),
    ).toBeTruthy();

    // owner can fix & republish from rejected
    await request(app)
      .post(`/api/v1/venues/${venueId}/publish`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
  });

  it('material edit on an approved venue re-enters review; payAtVenue toggle does not', async () => {
    const { owner, venueId } = await approvedVenue('Re-review Arena');
    const auth = ['Authorization', `Bearer ${owner.token}`] as const;

    const toggle = await request(app)
      .patch(`/api/v1/venues/${venueId}`)
      .set(...auth)
      .send({ payAtVenue: true })
      .expect(200);
    expect(toggle.body.data.status).toBe('approved');

    const rename = await request(app)
      .patch(`/api/v1/venues/${venueId}`)
      .set(...auth)
      .send({ name: 'Re-review Arena Deluxe' })
      .expect(200);
    expect(rename.body.data.status).toBe('pending_review');
  });
});

describe('public search (§4.4 GET /venues)', () => {
  it('filters by area, amenities, priceMax; paginates with a cursor', async () => {
    await approvedVenue('Search Cheap Thamel');
    await Venue.updateOne({ name: 'Search Cheap Thamel' }, { area: 'Thamel' });
    await approvedVenue('Search Pricey Thamel', { basePrice: 5000 });
    await Venue.updateOne(
      { name: 'Search Pricey Thamel' },
      { area: 'Thamel', amenities: ['parking', 'shower'] },
    );

    const byArea = await request(app).get('/api/v1/venues?area=thamel').expect(200);
    const areaNames = (byArea.body.data as { name: string }[]).map((v) => v.name);
    expect(areaNames).toEqual(
      expect.arrayContaining(['Search Cheap Thamel', 'Search Pricey Thamel']),
    );

    const byPrice = await request(app).get('/api/v1/venues?area=thamel&priceMax=2000').expect(200);
    expect((byPrice.body.data as { name: string }[]).map((v) => v.name)).toEqual([
      'Search Cheap Thamel',
    ]);

    const byAmenity = await request(app)
      .get('/api/v1/venues?area=thamel&amenities=parking,shower')
      .expect(200);
    expect((byAmenity.body.data as { name: string }[]).map((v) => v.name)).toEqual([
      'Search Pricey Thamel',
    ]);

    const page1 = await request(app).get('/api/v1/venues?area=thamel&limit=1').expect(200);
    expect(page1.body.data).toHaveLength(1);
    expect(page1.body.meta.nextCursor).toBeTruthy();
    const page2 = await request(app)
      .get(`/api/v1/venues?area=thamel&limit=1&cursor=${page1.body.meta.nextCursor}`)
      .expect(200);
    expect(page2.body.data[0].name).not.toBe(page1.body.data[0].name);

    await request(app).get('/api/v1/venues?priceMax=free').expect(422);
  });
});

describe('photo upload signing (§2.6)', () => {
  it('returns a valid Cloudinary signature to the owner only', async () => {
    const { owner, venueId } = await approvedVenue('Photo Sign Arena');
    const res = await request(app)
      .post(`/api/v1/venues/${venueId}/photos/sign`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    const { cloudName, apiKey, timestamp, folder, signature } = res.body.data;
    expect(cloudName).toBe('test-cloud');
    expect(apiKey).toBe('test-key');
    expect(folder).toBe(`venues/${venueId}`);
    const expected = createHash('sha1')
      .update(`folder=${folder}&timestamp=${timestamp}test-secret`)
      .digest('hex');
    expect(signature).toBe(expected);

    const stranger = await makeUser();
    await request(app)
      .post(`/api/v1/venues/${venueId}/photos/sign`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(404);
  });
});
