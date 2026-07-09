import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { fail } from '../errors.js';
import { config } from '../config.js';

/**
 * Rate tiers from blueprint §4.3. Remaining tiers (bookings, assistant)
 * arrive with their endpoints.
 * ponytail: in-memory store — single instance now; swap to Redis store at 2+ instances (D-6).
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? Number.MAX_SAFE_INTEGER : 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: fail('RATE_LIMITED', 'Too many requests — try again later.'),
});

const authTier = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.isTest ? Number.MAX_SAFE_INTEGER : 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) =>
      `${ipKeyGenerator(req.ip ?? '')}:${((req.body as { email?: string } | undefined)?.email ?? '').toLowerCase()}`,
    message: fail('RATE_LIMITED', 'Too many attempts — try again in 15 minutes.'),
  });

/** Login/register tier: 5 / 15 min keyed by IP + email (§4.3). */
export const authRateLimiter = authTier();

/** Assistant tier: 20 msgs / hour keyed by userId or IP (§4.3). */
export const assistantRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.isTest ? Number.MAX_SAFE_INTEGER : 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  message: fail('RATE_LIMITED', 'Assistant limit reached — try again later.'),
});

/** POST /bookings tier: 10 / hour per user (§4.3) — mounted after requireAuth. */
export const bookingRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.isTest ? Number.MAX_SAFE_INTEGER : 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  message: fail('RATE_LIMITED', 'Booking limit reached — try again later.'),
});
/**
 * Separate bucket for forgot/resend: an attacker who exhausts a victim's
 * login bucket must not also block their password reset.
 */
export const emailFlowRateLimiter = authTier();
