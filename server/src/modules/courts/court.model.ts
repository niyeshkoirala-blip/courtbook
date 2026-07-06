import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { CourtDto } from '@courtbook/shared';

/** courts collection (blueprint §5.2). Times are minutes-from-midnight NPT. */
const courtSchema = new Schema(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
    name: { type: String, required: true },
    surface: { type: String, enum: ['turf', 'wood', 'concrete', 'asphalt'], required: true },
    size: { type: String, required: true },
    basePrice: { type: Number, required: true }, // NPR per slot, snapshot into bookings (§7.2)
    slotMinutes: { type: Number, default: 60 },
    schedule: {
      type: [{ openMin: Number, closeMin: Number, closed: Boolean, _id: false }],
      required: true, // always length 7, Sunday-first — enforced by shared Zod schema
    },
    priceOverrides: {
      type: [{ dayOfWeek: Number, startMin: Number, endMin: Number, price: Number, _id: false }],
      default: [],
    },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

export type CourtDoc = HydratedDocument<InferSchemaType<typeof courtSchema>>;
export const Court = model('Court', courtSchema);

export function toCourtDto(c: CourtDoc): CourtDto {
  return {
    id: c.id as string,
    venueId: c.venueId.toString(),
    name: c.name,
    surface: c.surface,
    size: c.size,
    basePrice: c.basePrice,
    slotMinutes: c.slotMinutes,
    schedule: c.schedule.map((d) => ({
      openMin: d.openMin ?? 0,
      closeMin: d.closeMin ?? 0,
      closed: d.closed ?? false,
    })),
    priceOverrides: c.priceOverrides.map((o) => ({
      ...(o.dayOfWeek !== null && o.dayOfWeek !== undefined && { dayOfWeek: o.dayOfWeek }),
      startMin: o.startMin ?? 0,
      endMin: o.endMin ?? 0,
      price: o.price ?? 0,
    })),
    active: c.active,
  };
}
