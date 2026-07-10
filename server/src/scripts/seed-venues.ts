/**
 * Seeds 40 realistic Kathmandu-valley futsal venues for testing/demo.
 * Idempotent — upserts by slug; safe to re-run.
 *
 *   npm run seed:venues
 *
 * All owned by the demo owner (demo-owner@courtbook.local), approved and
 * published so they show up in public search. Varied areas, prices, surfaces,
 * amenities, and open hours give the grid, filters and search real data.
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
  open: [number, number]; // [openMin, closeMin]
}

// Real Kathmandu-valley localities with plausible coordinates.
const VENUES: VenueSeed[] = [
  {
    name: 'Futsal Nepal Kupondole',
    area: 'Kupondole',
    lat: 27.6829,
    lng: 85.3168,
    price: 1500,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'changing_room'],
    payAtVenue: true,
    courts: 2,
    open: [360, 1320],
  },
  {
    name: 'Everest Futsal Baneshwor',
    area: 'Baneshwor',
    lat: 27.6939,
    lng: 85.342,
    price: 1800,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'canteen', 'shower'],
    payAtVenue: true,
    courts: 2,
    open: [360, 1380],
  },
  {
    name: 'Pulchowk Futsal Ground',
    area: 'Pulchowk',
    lat: 27.6795,
    lng: 85.3178,
    price: 1600,
    surface: 'turf',
    amenities: ['floodlights', 'drinking_water'],
    payAtVenue: false,
    courts: 1,
    open: [360, 1320],
  },
  {
    name: 'Satdobato Sports Futsal',
    area: 'Satdobato',
    lat: 27.6587,
    lng: 85.3247,
    price: 1400,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'first_aid'],
    payAtVenue: true,
    courts: 2,
    open: [300, 1320],
  },
  {
    name: 'Chabahil Futsal Arena',
    area: 'Chabahil',
    lat: 27.7172,
    lng: 85.3465,
    price: 1300,
    surface: 'concrete',
    amenities: ['parking', 'canteen'],
    payAtVenue: true,
    courts: 1,
    open: [360, 1260],
  },
  {
    name: 'Kalanki Futsal Hub',
    area: 'Kalanki',
    lat: 27.6935,
    lng: 85.281,
    price: 1200,
    surface: 'asphalt',
    amenities: ['parking', 'floodlights'],
    payAtVenue: false,
    courts: 2,
    open: [360, 1320],
  },
  {
    name: 'Balaju Futsal Center',
    area: 'Balaju',
    lat: 27.7361,
    lng: 85.3013,
    price: 1350,
    surface: 'turf',
    amenities: ['floodlights', 'changing_room', 'drinking_water'],
    payAtVenue: true,
    courts: 1,
    open: [360, 1320],
  },
  {
    name: 'Sinamangal Futsal',
    area: 'Sinamangal',
    lat: 27.6935,
    lng: 85.3565,
    price: 1700,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'shower', 'canteen'],
    payAtVenue: true,
    courts: 2,
    open: [300, 1380],
  },
  {
    name: 'Kirtipur Futsal Park',
    area: 'Kirtipur',
    lat: 27.6787,
    lng: 85.2774,
    price: 1100,
    surface: 'turf',
    amenities: ['floodlights'],
    payAtVenue: false,
    courts: 1,
    open: [360, 1260],
  },
  {
    name: 'Gongabu Futsal Zone',
    area: 'Gongabu',
    lat: 27.7357,
    lng: 85.3169,
    price: 1450,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'changing_room'],
    payAtVenue: true,
    courts: 2,
    open: [360, 1320],
  },
  {
    name: 'Boudha Futsal Ground',
    area: 'Boudha',
    lat: 27.7215,
    lng: 85.362,
    price: 1550,
    surface: 'turf',
    amenities: ['parking', 'canteen', 'first_aid'],
    payAtVenue: true,
    courts: 1,
    open: [360, 1320],
  },
  {
    name: 'Jawalakhel Futsal Arena',
    area: 'Jawalakhel',
    lat: 27.6714,
    lng: 85.3126,
    price: 1900,
    surface: 'wood',
    amenities: ['parking', 'floodlights', 'shower', 'changing_room', 'canteen'],
    payAtVenue: true,
    courts: 2,
    open: [300, 1380],
  },
  {
    name: 'Maharajgunj Futsal',
    area: 'Maharajgunj',
    lat: 27.7361,
    lng: 85.3315,
    price: 2000,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'shower'],
    payAtVenue: true,
    courts: 2,
    open: [360, 1380],
  },
  {
    name: 'Koteshwor Futsal Point',
    area: 'Koteshwor',
    lat: 27.678,
    lng: 85.348,
    price: 1250,
    surface: 'concrete',
    amenities: ['parking', 'floodlights'],
    payAtVenue: false,
    courts: 1,
    open: [360, 1320],
  },
  {
    name: 'Bhaktapur Futsal Center',
    area: 'Bhaktapur',
    lat: 27.671,
    lng: 85.4298,
    price: 1150,
    surface: 'turf',
    amenities: ['parking', 'drinking_water'],
    payAtVenue: true,
    courts: 1,
    open: [360, 1260],
  },
  {
    name: 'Lalitpur Futsal Arena',
    area: 'Lalitpur',
    lat: 27.6644,
    lng: 85.3188,
    price: 1750,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'changing_room', 'first_aid'],
    payAtVenue: true,
    courts: 2,
    open: [300, 1380],
  },
  {
    name: 'Thimi Futsal Ground',
    area: 'Thimi',
    lat: 27.6807,
    lng: 85.3856,
    price: 1050,
    surface: 'asphalt',
    amenities: ['floodlights'],
    payAtVenue: false,
    courts: 1,
    open: [360, 1260],
  },
  {
    name: 'Naxal Futsal Club',
    area: 'Naxal',
    lat: 27.714,
    lng: 85.331,
    price: 2100,
    surface: 'wood',
    amenities: ['parking', 'floodlights', 'shower', 'canteen'],
    payAtVenue: true,
    courts: 2,
    open: [360, 1380],
  },
  {
    name: 'Tokha Futsal Turf',
    area: 'Tokha',
    lat: 27.752,
    lng: 85.329,
    price: 1000,
    surface: 'turf',
    amenities: ['floodlights', 'drinking_water'],
    payAtVenue: false,
    courts: 1,
    open: [360, 1260],
  },
  {
    name: 'Baluwatar Futsal Arena',
    area: 'Baluwatar',
    lat: 27.7245,
    lng: 85.3312,
    price: 2500,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'shower', 'changing_room', 'canteen', 'first_aid'],
    payAtVenue: true,
    courts: 3,
    open: [300, 1380],
  },
  {
    name: 'Dhapasi Futsal',
    area: 'Dhapasi',
    lat: 27.746,
    lng: 85.325,
    price: 1300,
    surface: 'turf',
    amenities: ['parking', 'floodlights'],
    payAtVenue: true,
    courts: 1,
    open: [360, 1320],
  },
  {
    name: 'Budhanilkantha Futsal',
    area: 'Budhanilkantha',
    lat: 27.7772,
    lng: 85.362,
    price: 1600,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'canteen'],
    payAtVenue: true,
    courts: 2,
    open: [360, 1320],
  },
  {
    name: 'Imadol Futsal Arena',
    area: 'Imadol',
    lat: 27.6603,
    lng: 85.3445,
    price: 1250,
    surface: 'turf',
    amenities: ['floodlights', 'drinking_water'],
    payAtVenue: false,
    courts: 1,
    open: [360, 1260],
  },
  {
    name: 'Sanepa Futsal Club',
    area: 'Sanepa',
    lat: 27.6842,
    lng: 85.3067,
    price: 2000,
    surface: 'wood',
    amenities: ['parking', 'floodlights', 'shower', 'changing_room'],
    payAtVenue: true,
    courts: 2,
    open: [300, 1380],
  },
  {
    name: 'Kumaripati Futsal',
    area: 'Kumaripati',
    lat: 27.6688,
    lng: 85.3232,
    price: 1500,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'first_aid'],
    payAtVenue: true,
    courts: 1,
    open: [360, 1320],
  },
  {
    name: 'Ekantakuna Futsal Zone',
    area: 'Ekantakuna',
    lat: 27.6612,
    lng: 85.3081,
    price: 1400,
    surface: 'turf',
    amenities: ['parking', 'floodlights'],
    payAtVenue: false,
    courts: 2,
    open: [360, 1320],
  },
  {
    name: 'Swayambhu Futsal Ground',
    area: 'Swayambhu',
    lat: 27.7149,
    lng: 85.2903,
    price: 1350,
    surface: 'concrete',
    amenities: ['floodlights', 'canteen'],
    payAtVenue: true,
    courts: 1,
    open: [360, 1260],
  },
  {
    name: 'Sitapaila Futsal',
    area: 'Sitapaila',
    lat: 27.7138,
    lng: 85.2795,
    price: 1150,
    surface: 'asphalt',
    amenities: ['floodlights'],
    payAtVenue: false,
    courts: 1,
    open: [360, 1260],
  },
  {
    name: 'Samakhusi Futsal Hub',
    area: 'Samakhusi',
    lat: 27.7355,
    lng: 85.31,
    price: 1450,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'changing_room'],
    payAtVenue: true,
    courts: 2,
    open: [360, 1320],
  },
  {
    name: 'Basundhara Futsal',
    area: 'Basundhara',
    lat: 27.7462,
    lng: 85.3372,
    price: 1550,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'shower'],
    payAtVenue: true,
    courts: 2,
    open: [360, 1380],
  },
  {
    name: 'Thapathali Futsal Arena',
    area: 'Thapathali',
    lat: 27.6928,
    lng: 85.3182,
    price: 1800,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'canteen', 'first_aid'],
    payAtVenue: true,
    courts: 2,
    open: [300, 1380],
  },
  {
    name: 'Anamnagar Futsal',
    area: 'Anamnagar',
    lat: 27.7009,
    lng: 85.323,
    price: 1600,
    surface: 'turf',
    amenities: ['floodlights', 'drinking_water'],
    payAtVenue: false,
    courts: 1,
    open: [360, 1320],
  },
  {
    name: 'Putalisadak Futsal',
    area: 'Putalisadak',
    lat: 27.7043,
    lng: 85.3245,
    price: 1700,
    surface: 'turf',
    amenities: ['parking', 'floodlights'],
    payAtVenue: true,
    courts: 1,
    open: [360, 1320],
  },
  {
    name: 'Dillibazar Futsal Point',
    area: 'Dillibazar',
    lat: 27.7051,
    lng: 85.3277,
    price: 1500,
    surface: 'concrete',
    amenities: ['floodlights'],
    payAtVenue: false,
    courts: 1,
    open: [360, 1260],
  },
  {
    name: 'Tinkune Futsal Arena',
    area: 'Tinkune',
    lat: 27.6866,
    lng: 85.3487,
    price: 1650,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'shower', 'canteen'],
    payAtVenue: true,
    courts: 2,
    open: [300, 1380],
  },
  {
    name: 'Maitidevi Futsal',
    area: 'Maitidevi',
    lat: 27.7061,
    lng: 85.3345,
    price: 1400,
    surface: 'turf',
    amenities: ['floodlights', 'changing_room'],
    payAtVenue: true,
    courts: 1,
    open: [360, 1320],
  },
  {
    name: 'Kalimati Futsal Ground',
    area: 'Kalimati',
    lat: 27.6971,
    lng: 85.2965,
    price: 1200,
    surface: 'asphalt',
    amenities: ['parking', 'floodlights'],
    payAtVenue: false,
    courts: 2,
    open: [360, 1320],
  },
  {
    name: 'Tripureshwor Futsal',
    area: 'Tripureshwor',
    lat: 27.6944,
    lng: 85.3115,
    price: 1550,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'first_aid'],
    payAtVenue: true,
    courts: 1,
    open: [360, 1320],
  },
  {
    name: 'Lagankhel Futsal Arena',
    area: 'Lagankhel',
    lat: 27.667,
    lng: 85.3241,
    price: 1750,
    surface: 'turf',
    amenities: ['parking', 'floodlights', 'shower', 'changing_room'],
    payAtVenue: true,
    courts: 2,
    open: [300, 1380],
  },
  {
    name: 'Godawari Futsal Turf',
    area: 'Godawari',
    lat: 27.5978,
    lng: 85.3796,
    price: 1000,
    surface: 'turf',
    amenities: ['floodlights', 'drinking_water'],
    payAtVenue: false,
    courts: 1,
    open: [360, 1200],
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

  logger.info({ venues: created }, `seeded ${created} test futsal venues`);
  await disconnectDb();
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'venue seed failed');
  process.exit(1);
});
