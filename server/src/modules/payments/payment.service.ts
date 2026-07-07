import { Types } from 'mongoose';
import type { PaymentDto, PaymentInitiateInput, PaymentRedirect } from '@courtbook/shared';
import { formatNPT } from '@courtbook/shared';
import { AppError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import { Booking, type BookingDoc } from '../bookings/booking.model.js';
import { Venue } from '../venues/venue.model.js';
import { User } from '../users/user.model.js';
import { queueEmail } from '../notifications/outbox.js';
import { Payment, toPaymentDto, type PaymentDoc } from './payment.model.js';
import { buildEsewaRedirect, verifyEsewaCallback, type VerifiedCallback } from './esewa.js';
import { initiateKhalti, verifyKhaltiCallback } from './khalti.js';

/** Loads a booking that is still a live pending hold, owned by the caller. */
async function payableBooking(bookingId: string, userId: string): Promise<BookingDoc> {
  if (!Types.ObjectId.isValid(bookingId)) throw new AppError('NOT_FOUND', 404, 'Booking not found');
  const booking = await Booking.findOne({ _id: bookingId, userId });
  if (!booking) throw new AppError('NOT_FOUND', 404, 'Booking not found');
  if (booking.status !== 'pending_payment') {
    throw new AppError('INVALID_STATUS', 409, `Booking is ${booking.status}, not payable`);
  }
  if (booking.expiresAt && booking.expiresAt < new Date()) {
    throw new AppError('INVALID_STATUS', 409, 'The booking hold has expired');
  }
  return booking;
}

/** POST /payments/initiate (§4.4). Re-initiation (provider switch) updates in place. */
export async function initiatePayment(
  input: PaymentInitiateInput,
  userId: string,
): Promise<PaymentRedirect> {
  const booking = await payableBooking(input.bookingId, userId);
  const venue = await Venue.findById(booking.venueId);

  const existing = await Payment.findOne({ bookingId: booking._id });
  if (existing?.status === 'verified') {
    throw new AppError('INVALID_STATUS', 409, 'This booking is already paid');
  }

  // pay-at-venue: no gateway — booking confirms immediately, unpaid (§6.1 H2)
  if (input.provider === 'venue') {
    if (!venue?.payAtVenue) {
      throw new AppError('VALIDATION', 422, 'This venue requires online payment');
    }
    const payment = await upsertPayment(booking, 'venue', {});
    await confirmBooking(booking, payment, { unpaid: true });
    return { paymentId: payment.id as string, provider: 'venue', bookingStatus: 'confirmed' };
  }

  if (input.provider === 'khalti') {
    const { url, pidx } = await initiateKhalti(
      booking.id as string,
      booking.price,
      `${venue?.name ?? 'CourtBook'} — futsal slot`,
    );
    const payment = await upsertPayment(booking, 'khalti', { providerTxnId: `khalti:${pidx}` });
    return {
      paymentId: payment.id as string,
      provider: 'khalti',
      url,
      bookingStatus: booking.status,
    };
  }

  const { url, fields } = buildEsewaRedirect(booking.id as string, booking.price);
  const payment = await upsertPayment(booking, 'esewa', {});
  return {
    paymentId: payment.id as string,
    provider: 'esewa',
    url,
    fields,
    bookingStatus: booking.status,
  };
}

async function upsertPayment(
  booking: BookingDoc,
  provider: 'esewa' | 'khalti' | 'venue',
  extra: Record<string, unknown>,
): Promise<PaymentDoc> {
  return Payment.findOneAndUpdate(
    { bookingId: booking._id },
    { provider, amount: booking.price, status: 'initiated', ...extra },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/**
 * POST /payments/callback/:provider (§4.4). Order matters for §8:
 * 1 verify cryptographically / via lookup API, 2 replay check (unique txn id),
 * 3 re-derive amount from OUR booking, 4 confirm. Idempotent — gateways retry.
 */
export async function handleCallback(
  provider: 'esewa' | 'khalti',
  payload: { data?: string; pidx?: string },
): Promise<PaymentDto> {
  let verified: VerifiedCallback;
  let payment: PaymentDoc | null;

  if (provider === 'esewa') {
    verified = verifyEsewaCallback(payload.data ?? '');
    payment = await Payment.findOne({ bookingId: verified.bookingId });
  } else {
    // pidx must be one WE initiated — forged/unknown ids die here
    payment = await Payment.findOne({ providerTxnId: `khalti:${payload.pidx}` });
    if (!payment) throw new AppError('NOT_FOUND', 404, 'Unknown payment');
    verified = await verifyKhaltiCallback(payload.pidx ?? '');
    verified.bookingId = payment.bookingId.toString();
  }
  if (!payment) throw new AppError('NOT_FOUND', 404, 'Unknown payment');

  // replay (§8): this txn already verified → idempotent no-op, gateway gets its 200
  if (payment.status === 'verified') {
    if (payment.providerTxnId && payment.providerTxnId !== verified.providerTxnId) {
      throw new AppError('INVALID_STATUS', 409, 'Booking already paid by another transaction');
    }
    return toPaymentDto(payment);
  }

  const booking = await Booking.findById(verified.bookingId);
  if (!booking) throw new AppError('NOT_FOUND', 404, 'Booking not found');

  // §8 amount tamper: gateway-reported amount must equal OUR price snapshot
  if (verified.amountNpr !== booking.price) {
    payment.status = 'failed';
    payment.set('raw', verified.raw);
    await payment.save();
    logger.warn(
      { bookingId: booking.id, expected: booking.price, got: verified.amountNpr },
      'payment amount mismatch',
    );
    throw new AppError('AMOUNT_MISMATCH', 400, 'Paid amount does not match the booking price');
  }

  payment.providerTxnId = verified.providerTxnId;
  payment.set('raw', verified.raw);
  payment.status = 'verified';
  await payment.save();

  // §6.5 late webhook: only a still-pending booking flips to confirmed. An
  // expired/rebooked slot is never force-confirmed — admin settles manually.
  const confirmed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'pending_payment' },
    { status: 'confirmed', expiresAt: null },
    { new: true },
  );
  if (confirmed) {
    await notifyConfirmed(confirmed);
  } else {
    logger.error(
      { bookingId: booking.id, status: booking.status, paymentId: payment.id },
      'verified payment for a non-pending booking — manual reconciliation needed (§6.5)',
    );
  }
  return toPaymentDto(payment);
}

async function confirmBooking(
  booking: BookingDoc,
  payment: PaymentDoc,
  opts: { unpaid?: boolean } = {},
): Promise<void> {
  const confirmed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'pending_payment' },
    { status: 'confirmed', expiresAt: null },
    { new: true },
  );
  if (confirmed) await notifyConfirmed(confirmed, opts);
  void payment; // venue payments stay 'initiated' until the owner marks them paid (M6)
}

/** §7.6: booking confirmed → email player + venue owner. */
async function notifyConfirmed(
  booking: BookingDoc,
  opts: { unpaid?: boolean } = {},
): Promise<void> {
  const [player, venue] = await Promise.all([
    booking.userId ? User.findById(booking.userId) : null,
    Venue.findById(booking.venueId),
  ]);
  const slot = `${booking.date} ${formatNPT(booking.startMin)}`;
  const payNote = opts.unpaid ? ` (pay Rs ${booking.price} at the venue)` : '';
  if (player) {
    await queueEmail(player.email, 'booking_confirmed', {
      name: player.name,
      venueName: venue?.name ?? 'the venue',
      slot: slot + payNote,
    });
  }
  const owner = venue && (await User.findById(venue.ownerId));
  if (owner) {
    await queueEmail(owner.email, 'booking_confirmed_owner', {
      name: owner.name,
      venueName: venue.name,
      slot,
    });
  }
}

/** GET /payments/:id — checkout polling (§3.3); booking owner only. */
export async function getPayment(paymentId: string, userId: string): Promise<PaymentDto> {
  if (!Types.ObjectId.isValid(paymentId)) throw new AppError('NOT_FOUND', 404, 'Payment not found');
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new AppError('NOT_FOUND', 404, 'Payment not found');
  const booking = await Booking.findById(payment.bookingId);
  if (!booking || booking.userId?.toString() !== userId) {
    throw new AppError('NOT_FOUND', 404, 'Payment not found');
  }
  return toPaymentDto(payment);
}
