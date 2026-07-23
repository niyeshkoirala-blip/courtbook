import { Router } from 'express';
import {
  courtCreateSchema,
  courtUpdateSchema,
  reviewCreateSchema,
  venueCreateSchema,
  venueUpdateSchema,
} from '@courtbook/shared';
import { validate } from '../../core/middleware/validate.js';
import { optionalAuth, requireAuth } from '../../core/middleware/auth.js';
import * as venueCtrl from './venue.controller.js';
import * as courtCtrl from '../courts/court.controller.js';
import * as reviewCtrl from '../reviews/review.controller.js';

/** /api/v1/venues (blueprint §4.4 Venues & Courts). */
export const venueRouter = Router();

venueRouter.get('/', venueCtrl.list);
venueRouter.get('/:slug', optionalAuth, venueCtrl.getBySlug);
venueRouter.post('/', requireAuth, validate(venueCreateSchema), venueCtrl.create);
venueRouter.patch('/:id', requireAuth, validate(venueUpdateSchema), venueCtrl.update);
venueRouter.post('/:id/publish', requireAuth, venueCtrl.publish);
venueRouter.post('/:id/photos/sign', requireAuth, venueCtrl.signPhotos);

// reviews live under their venue — public list, auth-gated upsert (players who booked)
venueRouter.get('/:id/reviews', reviewCtrl.list);
venueRouter.post('/:id/reviews', requireAuth, validate(reviewCreateSchema), reviewCtrl.upsert);

// courts live under their venue (§4.4); ownership enforced in the services
venueRouter.post('/:id/courts', requireAuth, validate(courtCreateSchema), courtCtrl.create);
venueRouter.patch(
  '/:id/courts/:courtId',
  requireAuth,
  validate(courtUpdateSchema),
  courtCtrl.update,
);
venueRouter.delete('/:id/courts/:courtId', requireAuth, courtCtrl.remove);
