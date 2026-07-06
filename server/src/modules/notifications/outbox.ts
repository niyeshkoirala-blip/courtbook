import nodemailer from 'nodemailer';
import { config } from '../../core/config.js';
import { logger } from '../../core/logger.js';
import { Notification } from './notification.model.js';

/**
 * Outbox worker (blueprint §2.10): in-process 10 s poll, at-least-once
 * delivery, 3 retries with 30s/2m/10m backoff (§4.5), then `failed` for
 * admin visibility.
 * ponytail: no DB lock — single instance now; add the lock doc (or BullMQ,
 * D-6) when a second instance exists.
 */

// jsonTransport in tests: sendMail succeeds without a socket, output discarded
const transport = config.isTest
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport(config.smtpUrl);

type Payload = Record<string, string>;

/** Plain-text templates (§2.11). HTML versions are an M8 polish item. */
const templates: Record<string, (p: Payload) => { subject: string; text: string }> = {
  verify_email: (p) => ({
    subject: 'Verify your CourtBook email',
    text: `Hi ${p.name},\n\nConfirm your email to activate your CourtBook account:\n${p.link}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this email.`,
  }),
  password_reset: (p) => ({
    subject: 'Reset your CourtBook password',
    text: `Hi ${p.name},\n\nReset your password here:\n${p.link}\n\nThis link expires in 30 minutes and works once. If you didn't request this, ignore this email.`,
  }),
  password_changed: (p) => ({
    subject: 'Your CourtBook password was changed',
    text: `Hi ${p.name},\n\nYour password was just changed and all devices were signed out. If this wasn't you, reset your password immediately and contact support.`,
  }),
  venue_approved: (p) => ({
    subject: `${p.venueName} is now live on CourtBook`,
    text: `Hi ${p.name},\n\nGood news — your venue "${p.venueName}" was approved and is now visible to players.`,
  }),
  venue_rejected: (p) => ({
    subject: `${p.venueName} needs changes before going live`,
    text: `Hi ${p.name},\n\nYour venue "${p.venueName}" wasn't approved yet.\n\nReviewer note: ${p.reason}\n\nUpdate the listing and publish again when ready.`,
  }),
  booking_cancelled: (p) => ({
    subject: 'Your booking was cancelled',
    text: `Hi ${p.name},\n\nYour booking for ${p.slot} is cancelled. Refund: ${p.refundPct}% (settled manually for now — the venue will be in touch).`,
  }),
  booking_cancelled_owner: (p) => ({
    subject: `Booking cancelled at ${p.venueName}`,
    text: `Hi ${p.name},\n\nA booking at ${p.venueName} for ${p.slot} was cancelled by the player. The slot is open again.`,
  }),
  hold_expired: (p) => ({
    subject: 'Your booking hold expired',
    text: `Hi ${p.name},\n\nYour unpaid booking for ${p.date} expired after 10 minutes and the slot was released. You can rebook any free slot.`,
  }),
};

/** Services call this — never sendMail directly (request path stays fast, §9). */
export async function queueEmail(to: string, templateId: string, payload: Payload): Promise<void> {
  await Notification.create({ to, templateId, payload });
}

const RETRY_BACKOFF_MS = [30_000, 120_000, 600_000];
const MAX_ATTEMPTS = 3;

/** One delivery pass. Exported so tests can run it synchronously. */
export async function sendPending(): Promise<void> {
  const batch = await Notification.find({
    status: 'queued',
    sendAfter: { $lte: new Date() },
  }).limit(20);

  for (const n of batch) {
    const render = templates[n.templateId];
    const payload = Object.fromEntries(n.payload ?? []);
    try {
      if (!render) throw new Error(`unknown template ${n.templateId}`);
      const { subject, text } = render(payload);
      await transport.sendMail({ from: config.emailFrom, to: n.to, subject, text });
      n.status = 'sent';
      n.sentAt = new Date();
    } catch (err) {
      n.attempts += 1;
      if (n.attempts >= MAX_ATTEMPTS) {
        n.status = 'failed';
        logger.error({ err, notificationId: n.id }, 'notification permanently failed');
      } else {
        n.sendAfter = new Date(Date.now() + (RETRY_BACKOFF_MS[n.attempts - 1] ?? 600_000));
      }
    }
    await n.save();
  }
}

export function startOutboxWorker(): void {
  setInterval(() => {
    void sendPending().catch((err: unknown) => logger.error({ err }, 'outbox pass failed'));
  }, 10_000).unref();
  logger.info('outbox worker started (10s poll)');
}
