import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { PaymentDto } from '@courtbook/shared';

/** payments (blueprint §5.2). raw webhook payloads kept for audit (§8). */
const paymentSchema = new Schema(
  {
    // one payment doc per booking — re-initiation updates it in place
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    provider: { type: String, enum: ['esewa', 'khalti', 'venue'], required: true },
    // replay-proof: a gateway txn id can only ever verify once (§8)
    providerTxnId: { type: String, unique: true, sparse: true },
    amount: { type: Number, required: true }, // NPR, always re-derived from the booking
    status: {
      type: String,
      enum: ['initiated', 'verified', 'failed', 'refund_recorded'],
      default: 'initiated',
      index: true,
    },
    raw: { type: Schema.Types.Mixed }, // gateway payload for audit
  },
  { timestamps: true },
);

export type PaymentDoc = HydratedDocument<InferSchemaType<typeof paymentSchema>>;
export const Payment = model('Payment', paymentSchema);

export function toPaymentDto(p: PaymentDoc): PaymentDto {
  return {
    id: p.id as string,
    bookingId: p.bookingId.toString(),
    provider: p.provider,
    status: p.status,
    amount: p.amount,
  };
}
