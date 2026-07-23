import { z } from 'zod';

/** Venue & court schemas + DTOs (blueprint §4.4, §5.2). */

export const AMENITIES = [
  'parking',
  'changing_room',
  'shower',
  'drinking_water',
  'canteen',
  'first_aid',
  'floodlights',
] as const;

export const SURFACES = ['turf', 'wood', 'concrete', 'asphalt'] as const;

const MINUTES_IN_DAY = 24 * 60;
const minutesOfDay = z.number().int().min(0).max(MINUTES_IN_DAY);

/** One weekday's opening window, minutes-from-midnight NPT (§3.0 convention). */
const dayScheduleSchema = z
  .object({
    openMin: minutesOfDay.default(6 * 60),
    closeMin: minutesOfDay.default(21 * 60),
    closed: z.boolean().default(false),
  })
  .refine((d) => d.closed || d.openMin < d.closeMin, {
    message: 'openMin must be before closeMin',
  });

/** §5.2 courts: overrides must sit inside open hours — checked in service (needs schedule). */
export const priceOverrideSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6).optional(), // 0 = Sunday
    startMin: minutesOfDay,
    endMin: minutesOfDay,
    price: z.number().int().min(100).max(100000),
  })
  .refine((o) => o.startMin < o.endMin, { message: 'startMin must be before endMin' });

export const courtCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  surface: z.enum(SURFACES),
  size: z.string().trim().min(2).max(20), // e.g. "5v5"
  basePrice: z.number().int().min(100).max(100000), // NPR per slot
  slotMinutes: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]).default(60),
  schedule: z.array(dayScheduleSchema).length(7),
  priceOverrides: z.array(priceOverrideSchema).max(20).default([]),
});
export const courtUpdateSchema = courtCreateSchema.partial();
export type CourtCreateInput = z.infer<typeof courtCreateSchema>;

export const venueCreateSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(2000).default(''),
  area: z.string().trim().min(2).max(60), // e.g. "Baneshwor"
  geo: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .optional(),
  amenities: z.array(z.enum(AMENITIES)).max(AMENITIES.length).default([]),
  payAtVenue: z.boolean().default(false),
  photos: z
    .array(z.object({ url: z.string().url(), publicId: z.string().min(1) }))
    .max(5) // §2.6: 5 images per venue
    .default([]),
});
export const venueUpdateSchema = venueCreateSchema.partial();
export type VenueCreateInput = z.infer<typeof venueCreateSchema>;

export const venueRejectSchema = z.object({ reason: z.string().trim().min(3).max(500) });

/** GET /venues query — strings because it's a querystring (§4.4). */
export const venueQuerySchema = z.object({
  area: z.string().trim().min(1).optional(),
  amenities: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(z.enum(AMENITIES)))
    .optional(),
  priceMax: z.coerce.number().int().positive().optional(),
  cursor: z
    .string()
    .regex(/^[0-9a-f]{24}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type VenueStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';

export interface VenueDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  area: string;
  geo?: { lat: number; lng: number };
  amenities: string[];
  photos: { url: string; publicId: string }[];
  payAtVenue: boolean;
  status: VenueStatus;
  rejectionReason?: string;
  /** Denormalized review aggregate (§ reviews) — 0/0 until first review. */
  ratingAvg: number;
  ratingCount: number;
}

export interface CourtDto {
  id: string;
  venueId: string;
  name: string;
  surface: (typeof SURFACES)[number];
  size: string;
  basePrice: number;
  slotMinutes: number;
  schedule: { openMin: number; closeMin: number; closed: boolean }[];
  priceOverrides: { dayOfWeek?: number; startMin: number; endMin: number; price: number }[];
  active: boolean;
}
