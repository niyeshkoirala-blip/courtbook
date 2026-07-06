import cron from 'node-cron';
import { logger } from '../core/logger.js';
import { Booking } from '../modules/bookings/booking.model.js';
import { User } from '../modules/users/user.model.js';
import { queueEmail } from '../modules/notifications/outbox.js';

/**
 * Expiry sweeper (blueprint §2.10): every 5 min, pending_payment bookings
 * past their 10-min hold flip to `expired` — they drop out of the partial
 * unique index and the slot instantly reopens (§5.2).
 * ponytail: no DB lock guard — single instance; add the lock doc at 2+ instances.
 */
export async function sweepExpiredHolds(): Promise<number> {
  const stale = await Booking.find({ status: 'pending_payment', expiresAt: { $lt: new Date() } });
  if (stale.length === 0) return 0;

  await Booking.updateMany(
    { _id: { $in: stale.map((b) => b._id) }, status: 'pending_payment' },
    { status: 'expired' },
  );
  for (const b of stale) {
    const user = b.userId && (await User.findById(b.userId));
    if (user) {
      await queueEmail(user.email, 'hold_expired', { name: user.name, date: b.date });
    }
  }
  logger.info({ count: stale.length }, 'expired stale booking holds');
  return stale.length;
}

export function startExpirySweeper(): void {
  cron.schedule('*/5 * * * *', () => {
    void sweepExpiredHolds().catch((err: unknown) => logger.error({ err }, 'expiry sweep failed'));
  });
  // also sweep at boot — a restart shouldn't extend anyone's hold
  void sweepExpiredHolds().catch(() => undefined);
  logger.info('expiry sweeper scheduled (*/5m)');
}
