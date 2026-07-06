/**
 * Seeds N verified users + a venue/court for the k6 race test (§11.5),
 * then writes tokens + target slot to race-input.json.
 *
 * Usage: node scripts/race-test/seed.mjs [mongo-uri] [count]
 * Requires the same JWT_SECRET the API server runs with.
 */
import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const uri = process.argv[2] ?? 'mongodb://localhost:27017/courtbook';
const count = Number(process.argv[3] ?? 100);
const secret = process.env.JWT_SECRET ?? 'change-me';

await mongoose.connect(uri);
const db = mongoose.connection.db;

const { insertedId: ownerId } = await db.collection('users').insertOne({
  name: 'Race Owner',
  email: `race-owner-${Date.now()}@race.local`,
  passwordHash: 'x',
  role: 'owner',
  emailVerifiedAt: new Date(),
});
const { insertedId: venueId } = await db.collection('venues').insertOne({
  ownerId,
  name: 'Race Arena',
  slug: `race-arena-${Date.now()}`,
  area: 'RaceTown',
  status: 'approved',
  payAtVenue: false,
  photos: [],
  amenities: [],
});
const { insertedId: courtId } = await db.collection('courts').insertOne({
  venueId,
  name: 'Race Court',
  surface: 'turf',
  size: '5v5',
  basePrice: 1500,
  slotMinutes: 60,
  active: true,
  schedule: Array.from({ length: 7 }, () => ({ openMin: 0, closeMin: 1440, closed: false })),
  priceOverrides: [],
});

const users = Array.from({ length: count }, (_, i) => ({
  name: `Racer ${i}`,
  email: `racer-${Date.now()}-${i}@race.local`,
  passwordHash: 'x',
  role: 'player',
  emailVerifiedAt: new Date(),
}));
const { insertedIds } = await db.collection('users').insertMany(users);
const tokens = Object.values(insertedIds).map((id) =>
  jwt.sign({ sub: id.toString(), role: 'player' }, secret, { expiresIn: '1h' }),
);

// tomorrow noon NPT — inside lead time + 14-day window
const npt = new Date(Date.now() + 345 * 60_000);
npt.setUTCDate(npt.getUTCDate() + 1);
const date = npt.toISOString().slice(0, 10);

writeFileSync(
  new URL('race-input.json', import.meta.url),
  JSON.stringify({ courtId: courtId.toString(), date, startMin: 720, tokens }, null, 2),
);
console.log(`seeded ${count} users, court ${courtId}, slot ${date} 12:00 NPT`);
await mongoose.disconnect();
