import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { connectDb, disconnectDb } from '../../core/db.js';
import { Notification } from '../notifications/notification.model.js';
import { sendPending } from '../notifications/outbox.js';

/**
 * M1 acceptance suite (blueprint Phase 14): every /auth endpoint's happy and
 * error paths, including the refresh-reuse-detection release gate.
 */

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

const PASSWORD = 'correct-horse-9';

function userInput(email: string) {
  return { name: 'Niyesh Tester', email, password: PASSWORD };
}

/** Pulls the last emailed one-time token for a user out of the outbox. */
async function lastEmailToken(email: string, templateId: string): Promise<string> {
  const n = await Notification.findOne({ to: email, templateId }).sort({ createdAt: -1 });
  const link = n?.payload?.get('link') ?? '';
  const match = /token=([0-9a-f]+)/.exec(link);
  if (!match?.[1]) throw new Error(`no ${templateId} token found for ${email}`);
  return match[1];
}

function refreshCookie(res: request.Response): string {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('no refresh cookie set');
  return cookie.split(';')[0]!;
}

/** register → verify (via emailed token) → returns a logged-in state. */
async function registerAndVerify(email: string) {
  await request(app).post('/api/v1/auth/register').send(userInput(email)).expect(201);
  const token = await lastEmailToken(email, 'verify_email');
  const res = await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(200);
  return { accessToken: res.body.data.accessToken as string, cookie: refreshCookie(res) };
}

describe('POST /auth/register', () => {
  it('creates the user, queues a verify email, never leaks the hash', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...userInput('reg@test.com'), phone: '9812345678' })
      .expect(201);

    expect(res.body.data.user).toMatchObject({
      email: 'reg@test.com',
      role: 'player',
      phone: '9812345678',
      emailVerifiedAt: null,
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const queued = await Notification.findOne({ to: 'reg@test.com' });
    expect(queued?.templateId).toBe('verify_email');
    expect(queued?.status).toBe('queued');
  });

  it('409 EMAIL_EXISTS on duplicate (case-insensitive)', async () => {
    await request(app).post('/api/v1/auth/register').send(userInput('dup@test.com')).expect(201);
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(userInput('DUP@test.com'))
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_EXISTS');
  });

  it('422 VALIDATION with issue details on bad input', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'x', email: 'not-an-email', password: 'short' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION');
    const paths = (res.body.error.details as { path: string }[]).map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });
});

describe('POST /auth/verify-email', () => {
  it('verifies and auto-logs-in (§6.3), token is single-use', async () => {
    await request(app).post('/api/v1/auth/register').send(userInput('verify@test.com')).expect(201);
    const token = await lastEmailToken('verify@test.com', 'verify_email');

    const res = await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.emailVerifiedAt).not.toBeNull();
    expect(refreshCookie(res)).toContain('refresh_token=');

    await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(400);
  });

  it('400 TOKEN_INVALID on a bogus token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: 'deadbeef' })
      .expect(400);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });
});

describe('POST /auth/login', () => {
  it('403 EMAIL_UNVERIFIED before verification', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send(userInput('unverified@test.com'))
      .expect(201);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'unverified@test.com', password: PASSWORD })
      .expect(403);
    expect(res.body.error.code).toBe('EMAIL_UNVERIFIED');
  });

  it('logs in a verified user with access token + refresh cookie', async () => {
    await registerAndVerify('login@test.com');
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@test.com', password: PASSWORD })
      .expect(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(refreshCookie(res)).toContain('refresh_token=');
  });

  it('identical 401 for unknown email and wrong password (§8 enumeration)', async () => {
    await registerAndVerify('enum@test.com');
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@test.com', password: PASSWORD })
      .expect(401);
    const wrongPw = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'enum@test.com', password: 'wrong-password-1' })
      .expect(401);
    expect(unknown.body).toEqual(wrongPw.body);
  });

  it('locks the account after 5 failures — 423 even with the right password', async () => {
    await registerAndVerify('lockout@test.com');
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'lockout@test.com', password: 'wrong-password-1' })
        .expect(401);
    }
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'lockout@test.com', password: PASSWORD })
      .expect(423);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });
});

describe('POST /auth/refresh — rotation & reuse detection (release gate)', () => {
  it('rotates: new cookie works, old cookie is dead, reuse kills the family', async () => {
    const { cookie: cookieA } = await registerAndVerify('rotate@test.com');

    // legitimate rotation A → B
    const resB = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieA).expect(200);
    const cookieB = refreshCookie(resB);
    expect(cookieB).not.toBe(cookieA);

    // replaying A = reuse → 401 AND the whole family is revoked (§2.7)
    await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieA).expect(401);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieB).expect(401);
  });

  it('401 without a cookie; 403 for a disallowed Origin', async () => {
    await request(app).post('/api/v1/auth/refresh').expect(401);
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', 'https://evil.example')
      .expect(403);
    expect(res.body.error.code).toBe('ORIGIN_FORBIDDEN');
  });
});

describe('POST /auth/logout', () => {
  it('204, clears the cookie, revokes the session', async () => {
    const { accessToken, cookie } = await registerAndVerify('logout@test.com');
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', cookie)
      .expect(204);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('401 UNAUTHENTICATED without a bearer token', async () => {
    await request(app).post('/api/v1/auth/logout').expect(401);
  });
});

describe('password reset flow', () => {
  it('forgot returns uniform 200; reset rotates the password and revokes sessions', async () => {
    const { cookie } = await registerAndVerify('reset@test.com');

    // unknown email → same 200, no email queued (§8)
    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ghost@test.com' })
      .expect(200);
    expect(await Notification.findOne({ to: 'ghost@test.com' })).toBeNull();

    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'reset@test.com' })
      .expect(200);
    const token = await lastEmailToken('reset@test.com', 'password_reset');

    const newPassword = 'brand-new-pass-1';
    await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: newPassword })
      .expect(200);

    // single-use token, all sessions revoked, old password dead, new one works
    await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: newPassword })
      .expect(400);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset@test.com', password: PASSWORD })
      .expect(401);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset@test.com', password: newPassword })
      .expect(200);
    // confirmation email queued (§7.6 security events)
    expect(
      await Notification.findOne({ to: 'reset@test.com', templateId: 'password_changed' }),
    ).toBeTruthy();
  });
});

describe('outbox worker', () => {
  it('sendPending delivers queued notifications and marks them sent', async () => {
    await request(app).post('/api/v1/auth/register').send(userInput('outbox@test.com')).expect(201);
    await sendPending();
    const n = await Notification.findOne({ to: 'outbox@test.com' });
    expect(n?.status).toBe('sent');
    expect(n?.sentAt).toBeInstanceOf(Date);
  });
});
