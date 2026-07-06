import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { BookingDto } from '@courtbook/shared';

/** bookings — the core domain collection (blueprint §5.2). */
const bookingSchema = new Schema(
  {
    courtId: { type: Schema.Types.ObjectId, ref: 'Court', required: true },
    // denormalized at create, never updated (§15 documented invariant)
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' }, // null for walk-ins
    date: { type: String, required: true }, // "YYYY-MM-DD" in NPT
    startMin: { type: Number, required: true },
    endMin: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show', 'expired'],
      required: true,
      index: true,
    },
    price: { type: Number, required: true }, // snapshot at booking time (§7.2)
    channel: { type: String, enum: ['online', 'walk_in'], required: true },
    customer: { type: { name: String, phone: String, _id: false } }, // walk-ins
    expiresAt: { type: Date }, // pending_payment hold deadline
    cancellation: {
      type: { at: Date, by: String, refundPct: Number, reason: String, _id: false },
    },
    idempotencyKey: { type: String },
  },
  { timestamps: true },
);

/**
 * THE index (blueprint §5.2) — the double-booking lock and integrity backbone
 * of the product. One active booking per (court, date, slot); cancelled and
 * expired bookings fall out of the partial filter, so slots reopen with zero
 * extra logic. NEVER work around this index.
 */
bookingSchema.index(
  { courtId: 1, date: 1, startMin: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending_payment', 'confirmed'] } } },
);
// §4.5 idempotency: repeat POST with the same key returns the original booking.
// partialFilter (not sparse!) — a compound sparse index would still index
// key-less bookings as (userId, null) and break a user's second booking.
bookingSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } },
);
// my-bookings and owner-day views (§9 hot queries)
bookingSchema.index({ userId: 1, status: 1, _id: -1 });
bookingSchema.index({ venueId: 1, date: 1, status: 1 });
bookingSchema.index({ courtId: 1, date: 1 });

export type BookingDoc = HydratedDocument<InferSchemaType<typeof bookingSchema>>;
export const Booking = model('Booking', bookingSchema);

export function toBookingDto(
  b: BookingDoc,
  names?: { courtName?: string; venueName?: string },
): BookingDto {
  return {
    id: b.id as string,
    courtId: b.courtId.toString(),
    venueId: b.venueId.toString(),
    ...(names?.courtName && { courtName: names.courtName }),
    ...(names?.venueName && { venueName: names.venueName }),
    date: b.date,
    startMin: b.startMin,
    endMin: b.endMin,
    status: b.status,
    price: b.price,
    channel: b.channel,
    ...(b.customer?.name && {
      customer: { name: b.customer.name, ...(b.customer.phone && { phone: b.customer.phone }) },
    }),
    ...(b.expiresAt && { expiresAt: b.expiresAt.toISOString() }),
    ...(b.cancellation?.at && {
      cancellation: {
        at: b.cancellation.at.toISOString(),
        by: b.cancellation.by ?? 'player',
        refundPct: b.cancellation.refundPct ?? 0,
        ...(b.cancellation.reason && { reason: b.cancellation.reason }),
      },
    }),
  };
}
