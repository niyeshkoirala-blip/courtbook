import { rateLimit } from 'express-rate-limit';
import { fail } from '../errors.js';
import { config } from '../config.js';

/**
 * Global API tier from blueprint §4.3: 300 req / 15 min per IP.
 * Per-route tiers (login, bookings, assistant) are added with their
 * endpoints in later milestones.
 * ponytail: in-memory store — single instance now; swap to Redis store at 2+ instances (D-6).
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? Number.MAX_SAFE_INTEGER : 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: fail('RATE_LIMITED', 'Too many requests — try again later.'),
});
