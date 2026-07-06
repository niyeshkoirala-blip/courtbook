import { Router } from 'express';
import {
  blockCreateSchema,
  bookingCancelSchema,
  bookingCreateSchema,
  walkinCreateSchema,
} from '@courtbook/shared';
import { validate } from '../../core/middleware/validate.js';
import { requireAuth } from '../../core/middleware/auth.js';
import { bookingRateLimiter } from '../../core/middleware/rate-limit.js';
import * as ctrl from './booking.controller.js';

/** Booking-domain routes (§4.4), mounted at /api/v1. */
export const bookingRouter = Router();

bookingRouter.post(
  '/bookings',
  requireAuth,
  bookingRateLimiter,
  validate(bookingCreateSchema),
  ctrl.create,
);
bookingRouter.get('/bookings/:id', requireAuth, ctrl.get);
bookingRouter.post('/bookings/:id/cancel', requireAuth, validate(bookingCancelSchema), ctrl.cancel);
bookingRouter.get('/me/bookings', requireAuth, ctrl.listMine);
// owner ops — ownership verified in the service layer (§2.7)
bookingRouter.post(
  '/owner/bookings/walkin',
  requireAuth,
  validate(walkinCreateSchema),
  ctrl.walkin,
);
bookingRouter.post('/owner/blocks', requireAuth, validate(blockCreateSchema), ctrl.createBlock);
bookingRouter.delete('/owner/blocks/:id', requireAuth, ctrl.deleteBlock);
