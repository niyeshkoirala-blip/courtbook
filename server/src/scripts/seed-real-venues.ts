/**
 * Seeds 15 real, well-known Kathmandu-valley futsal venues.
 * Idempotent — upserts by slug; safe to re-run.
 *
 *   npm run seed:real
 *
 * Owned by the demo owner (demo-owner@courtbook.local), approved and published
 * so they appear in public search. Names are actual local futsal venues;
 * coordinates are approximate locality centres (good enough for the map link).
 */
import bcrypt from 'bcryptjs';
import { config } from '../core/config.js';
import { connectDb, disconnectDb } from '../core/db.js';
import { logger } from '../core/logger.js';
import { User } from '../modules/users/user.model.js';
import { Venue } from '../modules/venues/venue.model.js';
import { Court } from '../modules/courts/court.model.js';

type Surface = 'turf' | 'wood' | 'concrete' | 'asphalt';

interface VenueSeed {
  name: string;
  area: string;
  lat: number;
  lng: number;
  price: number; // base NPR/hour
  surface: Surface;
  amenities: string[];
  payAtVenue: boolean;
  courts: number;
  open: [number, number]; // [openMin, closeMin] — minutes from midnight NPT
}

// Real, commonly-known futsal venues around the Kathmandu valley.
const VENUES: VenueSeed[] = [
  {
    name: 'Futsal Nepal',
    area: 'Sanepa',
    lat: 27.6832,
    lng: 85.3072,
    price: 1600,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'changing_room', 'drinking_water'],
    payAtVenue: true,
    courts: 2,
    open: [360, 1320],
  },
  {
    name: 'Prime Futsal',
    area: 'Sinamangal',
    lat: 27.6939,
    lng: 85.3562,
    price: 1700,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'canteen', 'shower'],
    payAtVenue: true,
    courts: 2,
    open: [360, 1380],
  },
  {
    name: 'Champions Futsal',
    area: 'Kupondole',
    lat: 27.6821,
    lng: 85.3159,
    price: 1800,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'changing_room'],
    payAtVenue: true,
    courts: 2,
    open: [300, 1380],
  },
  {
    name: 'One Futsal',
    area: 'Baluwatar',
    lat: 27.7248,
    lng: 85.3319,
    price: 2000,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'shower', 'canteen', 'first_aid'],
    payAtVenue: true,
    courts: 3,
    open: [300, 1380],
  },
  {
    name: 'Pitch Futsal',
    area: 'Jhamsikhel',
    lat: 27.6759,
    lng: 85.3088,
    price: 1900,
    surface: 'wood',
    amenities: ['parking', 'floodlights', 'shower', 'changing_room'],
    payAtVenue: true,
    courts: 2,
    open: [360, 1380],
  },
  {
    name: 'Everest Futsal',
    area: 'Chabahil',
    lat: 27.7175,
    lng: 85.3468,
    price: 1400,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'canteen'],
    payAtVenue: true,
    courts: 1,
    open: [360, 1320],
  },
  {
    name: 'Sagarmatha Futsal',
    area: 'Baneshwor',
    lat: 27.6935,
    lng: 85.3421,
    price: 1650,
    surface: 'turf',
    amenities: ['floodlights', 'drinking_water', 'first_aid'],
    payAtVenue: false,
    courts: 2,
    open: [360, 1320],
  },
  {
    name: 'Continental Futsal',
    area: 'Kalimati',
    lat: 27.6968,
    lng: 85.2971,
    price: 1300,
    surface: 'concrete',
    amenities: ['parking', 'floodlights'],
    payAtVenue: false,
    courts: 1,
    open: [360, 1260],
  },
  {
    name: 'Universal Futsal',
    area: 'Maharajgunj',
    lat: 27.7365,
    lng: 85.3312,
    price: 2100,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'shower', 'changing_room', 'canteen'],
    payAtVenue: true,
    courts: 2,
    open: [300, 1380],
  },
  {
    name: 'Galaxy Futsal',
    area: 'Kirtipur',
    lat: 27.6789,
    lng: 85.2771,
    price: 1100,
    surface: 'turf',
    amenities: ['floodlights', 'drinking_water'],
    payAtVenue: false,
    courts: 1,
    open: [360, 1260],
  },
  {
    name: 'Score Futsal',
    area: 'Bhaisepati',
    lat: 27.6461,
    lng: 85.3062,
    price: 1500,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'changing_room'],
    payAtVenue: true,
    courts: 2,
    open: [360, 1320],
  },
  {
    name: 'Kick Off Futsal',
    area: 'Ekantakuna',
    lat: 27.6615,
    lng: 85.3084,
    price: 1450,
    surface: 'turf',
    amenities: ['parking', 'floodlights'],
    payAtVenue: false,
    courts: 2,
    open: [360, 1320],
  },
  {
    name: 'Turf Nepal',
    area: 'Satdobato',
    lat: 27.6585,
    lng: 85.3251,
    price: 1550,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'first_aid', 'canteen'],
    payAtVenue: true,
    courts: 2,
    open: [300, 1380],
  },
  {
    name: 'Machhindra Futsal',
    area: 'Lagankhel',
    lat: 27.6672,
    lng: 85.3239,
    price: 1750,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'shower', 'changing_room'],
    payAtVenue: true,
    courts: 2,
    open: [300, 1380],
  },
  {
    name: 'Redwood Futsal',
    area: 'Naxal',
    lat: 27.7138,
    lng: 85.3308,
    price: 2200,
    surface: 'wood',
    amenities: ['parking', 'floodlights', 'shower', 'canteen', 'first_aid'],
    payAtVenue: true,
    courts: 2,
    open: [360, 1380],
  },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main(): Promise<void> {
  await connectDb();

  // owner (reuse the demo owner if the main seeder already ran)
  const passwordHash = await bcrypt.hash('demo-password-1', config.bcryptRounds);
  const owner = await User.findOneAndUpdate(
    { email: 'demo-owner@courtbook.local' },
    { name: 'Demo Owner', role: 'owner', emailVerifiedAt: new Date(), passwordHash },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const ownerId = owner!._id;

  let created = 0;
  for (const v of VENUES) {
    const slug = slugify(v.name);
    const venue = await Venue.findOneAndUpdate(
      { slug },
      {
        ownerId,
        name: v.name,
        area: v.area,
        status: 'approved',
        payAtVenue: v.payAtVenue,
        amenities: v.amenities,
        description: `${v.name} — ${v.surface} pitch in ${v.area}. ${v.courts} court${v.courts > 1 ? 's' : ''}, book online.`,
        geo: { type: 'Point', coordinates: [v.lng, v.lat] },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const venueId = venue!._id;

    const schedule = Array.from({ length: 7 }, () => ({
      openMin: v.open[0],
      closeMin: v.open[1],
      closed: false,
    }));
    for (let i = 0; i < v.courts; i += 1) {
      const name = `Court ${String.fromCharCode(65 + i)}`;
      // evening premium override on the last 5 hours
      const overrides = [
        { startMin: v.open[1] - 300, endMin: v.open[1], price: Math.round(v.price * 1.3) },
      ];
      await Court.findOneAndUpdate(
        { venueId, name },
        {
          venueId,
          name,
          surface: v.surface,
          size: '5v5',
          basePrice: v.price,
          slotMinutes: 60,
          schedule,
          priceOverrides: overrides,
          active: true,
        },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
    created += 1;
  }

  logger.info({ venues: created }, `seeded ${created} real futsal venues`);
  await disconnectDb();
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'real venue seed failed');
  process.exit(1);
});
