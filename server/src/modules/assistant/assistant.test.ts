import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { addDays, nowNPT } from '@courtbook/shared';
import { createApp } from '../../app.js';
import { config } from '../../core/config.js';
import { connectDb, disconnectDb } from '../../core/db.js';
import { User } from '../users/user.model.js';
import { Venue } from '../venues/venue.model.js';
import { Court } from '../courts/court.model.js';
import { Booking } from '../bookings/booking.model.js';
import { runTool } from './tools.js';
import { _setClientForTests } from './assistant.service.js';

/** M7 acceptance: guardrails (§7.7), tool handlers, the chat loop, 501 gate. */

const app = createApp();
let mongod: MongoMemoryServer;
const D2 = addDays(nowNPT().date, 2);

let courtId: string;
let playerId: string;
let playerToken: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
  await Booking.syncIndexes();

  const owner = await User.create({
    name: 'Bot Owner',
    email: 'bot-owner@test.local',
    passwordHash: 'x',
    role: 'owner',
    emailVerifiedAt: new Date(),
  });
  const player = await User.create({
    name: 'Bot Player',
    email: 'bot-player@test.local',
    passwordHash: 'x',
    role: 'player',
    emailVerifiedAt: new Date(),
  });
  playerId = player.id as string;
  playerToken = jwt.sign({ sub: playerId, role: 'player' }, config.jwtSecret);

  const venue = await Venue.create({
    ownerId: owner.id,
    name: 'Bot Arena',
    slug: 'bot-arena',
    area: 'Baneshwor',
    status: 'approved',
  });
  const court = await Court.create({
    venueId: venue.id,
    name: 'Court B',
    surface: 'turf',
    size: '5v5',
    basePrice: 1200,
    slotMinutes: 60,
    schedule: Array.from({ length: 7 }, () => ({ openMin: 360, closeMin: 1260, closed: false })),
  });
  courtId = court.id as string;
});

afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

describe('assistant tool handlers (same service layer, §7.7)', () => {
  it('search_venues returns published venues only', async () => {
    const { result } = await runTool('search_venues', { area: 'Baneshwor' }, {});
    expect(result).toContain('bot-arena');
  });

  it('check_availability lists free slots with prices', async () => {
    const { result } = await runTool(
      'check_availability',
      { venueSlug: 'bot-arena', date: D2 },
      {},
    );
    expect(result).toContain('Bot Arena');
    expect(result).toContain('Rs 1200');
  });

  it('create_booking_draft REFUSES without an authenticated user (§7.7)', async () => {
    const { result, bookingId } = await runTool(
      'create_booking_draft',
      { courtId, date: D2, startMin: 600 },
      {}, // no userId — whatever the model was tricked into asking for
    );
    expect(result).toMatch(/not logged in/i);
    expect(bookingId).toBeUndefined();
    expect(await Booking.countDocuments()).toBe(0);
  });

  it('create_booking_draft books via the atomic engine when authenticated', async () => {
    const { result, bookingId } = await runTool(
      'create_booking_draft',
      { courtId, date: D2, startMin: 600 },
      { userId: playerId },
    );
    expect(bookingId).toBeTruthy();
    expect(result).toContain('held for 10 minutes');
    expect((await Booking.findById(bookingId))?.status).toBe('pending_payment');

    // engine rules still apply — same slot again is a plain-text error, not a crash
    const dup = await runTool(
      'create_booking_draft',
      { courtId, date: D2, startMin: 600 },
      { userId: playerId },
    );
    expect(dup.result).toMatch(/^Error:/);
  });
});

describe('POST /assistant/chat', () => {
  it('501 NOT_CONFIGURED without an LLM_API_KEY', async () => {
    const res = await request(app)
      .post('/api/v1/assistant/chat')
      .send({ sessionId: 'session-abc-1', message: 'any courts free tomorrow?' })
      .expect(501);
    expect(res.body.error.code).toBe('NOT_CONFIGURED');
  });

  it('runs the tool loop with a (stubbed) model and returns the reply', async () => {
    const create = vi
      .fn()
      // round 1: model asks for a venue search
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'toolu_1', name: 'search_venues', input: { area: 'Baneshwor' } },
        ],
      })
      // round 2: model answers
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Bot Arena in Baneshwor has courts — want a slot?' }],
      });
    _setClientForTests({ messages: { create } });

    const res = await request(app)
      .post('/api/v1/assistant/chat')
      .send({ sessionId: 'session-abc-2', message: 'where can I play in baneshwor?' })
      .expect(200);

    expect(res.body.data.reply).toContain('Bot Arena');
    // the tool result actually flowed back into the second model call
    const secondCallMessages = create.mock.calls[1]![0].messages;
    const toolResultMsg = JSON.stringify(secondCallMessages.at(-1));
    expect(toolResultMsg).toContain('bot-arena');
    _setClientForTests(null);
  });

  it('withholds create_booking_draft from anonymous users (§7.7)', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
    });
    _setClientForTests({ messages: { create } });

    // anonymous → 2 tools
    await request(app)
      .post('/api/v1/assistant/chat')
      .send({ sessionId: 'session-abc-3', message: 'hi' })
      .expect(200);
    expect(create.mock.calls[0]![0].tools.map((t: { name: string }) => t.name)).toEqual([
      'search_venues',
      'check_availability',
    ]);

    // authenticated → all 3
    await request(app)
      .post('/api/v1/assistant/chat')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ sessionId: 'session-abc-4', message: 'hi' })
      .expect(200);
    expect(create.mock.calls[1]![0].tools).toHaveLength(3);
    _setClientForTests(null);
  });

  it('caps session history at 10 turns (§7.7)', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
    });
    _setClientForTests({ messages: { create } });

    for (let i = 0; i < 12; i += 1) {
      await request(app)
        .post('/api/v1/assistant/chat')
        .send({ sessionId: 'session-cap', message: `message ${i}` })
        .expect(200);
    }
    const lastCall = create.mock.calls.at(-1)![0];
    expect(lastCall.messages.length).toBeLessThanOrEqual(10);
    _setClientForTests(null);
  });

  it('422 on junk input', async () => {
    await request(app).post('/api/v1/assistant/chat').send({ message: '' }).expect(422);
  });
});
