/**
 * Demo data seeder (blueprint §1.9: seeded data for portfolio viewers, M8 DoD:
 * demo account live). Idempotent — safe to re-run; upserts by email/slug.
 *
 *   node --env-file=server/.env --import tsx server/src/scripts/seed.ts
 *
 * Creates a read-only-ish demo admin, a demo owner with two approved venues,
 * and a handful of bookings so the dashboards and reports have something to show.
 */
import bcrypt from 'bcryptjs';
import { addDays, nowNPT } from '@courtbook/shared';
import { config } from '../core/config.js';
import { connectDb, disconnectDb } from '../core/db.js';
import { logger } from '../core/logger.js';
import { User } from '../modules/users/user.model.js';
import { Venue } from '../modules/venues/venue.model.js';
import { Court } from '../modules/courts/court.model.js';
import { Booking } from '../modules/bookings/booking.model.js';

const DEMO_PASSWORD = 'demo-password-1';

async function upsertUser(
  email: string,
  name: string,
  role: 'player' | 'owner' | 'admin',
): Promise<string> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, config.bcryptRounds);
  const user = await User.findOneAndUpdate(
    { email },
    { name, role, emailVerifiedAt: new Date(), passwordHash },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return user!.id as string;
}

const openAllWeek = Array.from({ length: 7 }, () => ({
  openMin: 360,
  closeMin: 1320,
  closed: false,
}));

async function upsertVenue(
  ownerId: string,
  name: string,
  slug: string,
  area: string,
  lat: number,
  lng: number,
) {
  const venue = await Venue.findOneAndUpdate(
    { slug },
    {
      ownerId,
      name,
      area,
      status: 'approved',
      payAtVenue: true,
      amenities: ['parking', 'floodlights', 'changing_room'],
      description: `${name} — 5-a-side turf in ${area}, floodlit evenings.`,
      // real point (GeoJSON [lng,lat]) — a present-but-empty geo breaks the 2dsphere index
      geo: { type: 'Point', coordinates: [lng, lat] },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const venueId = venue!.id as string;
  let court = await Court.findOne({ venueId, name: 'Court A' });
  if (!court) {
    court = await Court.create({
      venueId,
      name: 'Court A',
      surface: 'turf',
      size: '5v5',
      basePrice: 1500,
      slotMinutes: 60,
      schedule: openAllWeek,
      priceOverrides: [{ startMin: 1020, endMin: 1320, price: 2000 }], // evening premium
    });
  }
  return { venueId, courtId: court.id as string };
}

async function main(): Promise<void> {
  await connectDb();
  logger.info('seeding demo data…');

  await upsertUser('demo-admin@courtbook.local', 'Demo Admin', 'admin');
  const ownerId = await upsertUser('demo-owner@courtbook.local', 'Demo Owner', 'owner');
  const playerId = await upsertUser('demo-player@courtbook.local', 'Demo Player', 'player');

  const hub = await upsertVenue(
    ownerId,
    'Baneshwor Futsal Hub',
    'baneshwor-futsal-hub',
    'Baneshwor',
    27.6939,
    85.342,
  );
  await upsertVenue(ownerId, 'Kupondole Arena', 'kupondole-arena', 'Kupondole', 27.6829, 85.3168);

  // a confirmed booking today + tomorrow so dashboards/reports aren't empty
  const today = nowNPT().date;
  for (const [date, startMin, channel] of [
    [today, 1080, 'walk_in'],
    [addDays(today, 1), 1140, 'online'],
  ] as const) {
    await Booking.findOneAndUpdate(
      { courtId: hub.courtId, date, startMin },
      {
        courtId: hub.courtId,
        venueId: hub.venueId,
        ...(channel === 'online' ? { userId: playerId } : {}),
        date,
        startMin,
        endMin: startMin + 60,
        status: 'confirmed',
        price: 2000,
        channel,
        ...(channel === 'walk_in' ? { customer: { name: 'Walk-in Guest' } } : {}),
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  logger.info(
    {
      admin: 'demo-admin@courtbook.local',
      owner: 'demo-owner@courtbook.local',
      player: 'demo-player@courtbook.local',
      password: DEMO_PASSWORD,
    },
    'seed complete',
  );
  await disconnectDb();
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'seed failed');
  process.exit(1);
});
