import { z } from 'zod';

/** Booking schemas + DTOs (blueprint §4.4 Availability & Bookings). */

const objectId = z.string().regex(/^[0-9a-f]{24}$/, 'Invalid id');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const minutesOfDay = z
  .number()
  .int()
  .min(0)
  .max(24 * 60);

export const bookingCreateSchema = z.object({
  courtId: objectId,
  date: dateStr,
  startMin: minutesOfDay,
  /** Client-generated; repeat POSTs return the original booking (§4.5). */
  idempotencyKey: z.string().min(8).max(100).optional(),
});
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;

export const bookingCancelSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});

export const walkinCreateSchema = z.object({
  courtId: objectId,
  date: dateStr,
  startMin: minutesOfDay,
  customer: z
    .object({
      name: z.string().trim().min(1).max(60),
      phone: z
        .string()
        .regex(/^9\d{9}$/)
        .optional(),
    })
    .optional(),
});
export type WalkinCreateInput = z.infer<typeof walkinCreateSchema>;

export const blockCreateSchema = z
  .object({
    courtId: objectId,
    date: dateStr,
    startMin: minutesOfDay,
    endMin: minutesOfDay,
    reason: z.string().trim().min(2).max(200),
  })
  .refine((b) => b.startMin < b.endMin, { message: 'startMin must be before endMin' });
export type BlockCreateInput = z.infer<typeof blockCreateSchema>;

export const availabilityQuerySchema = z.object({
  from: dateStr.optional(),
  // §4.4: ≤ 14 days window, 422 beyond — zod max is that gate
  days: z.coerce.number().int().min(1).max(14).default(7),
});

export const myBookingsQuerySchema = z.object({
  status: z
    .enum(['pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show', 'expired'])
    .optional(),
  cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SlotState = 'available' | 'taken' | 'blocked' | 'past';

export interface AvailabilitySlot {
  startMin: number;
  endMin: number;
  state: SlotState;
  /** Present only when available — resolved via §7.2 pricing order. */
  price?: number;
}

export interface AvailabilityDay {
  date: string;
  closed: boolean;
  slots: AvailabilitySlot[];
}

export type BookingStatus =
  'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'expired';

export interface BookingDto {
  id: string;
  courtId: string;
  venueId: string;
  courtName?: string;
  venueName?: string;
  date: string;
  startMin: number;
  endMin: number;
  status: BookingStatus;
  price: number;
  channel: 'online' | 'walk_in';
  customer?: { name: string; phone?: string };
  expiresAt?: string;
  cancellation?: { at: string; by: string; refundPct: number; reason?: string };
}

export interface BlockDto {
  id: string;
  courtId: string;
  date: string;
  startMin: number;
  endMin: number;
  reason: string;
}
