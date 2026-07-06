import { Router } from 'express';
import type { Request, Response } from 'express';
import { availabilityQuerySchema, nowNPT } from '@courtbook/shared';
import { ok } from '../../core/errors.js';
import { computeAvailability, getBookableCourt } from '../bookings/availability.js';

/** GET /api/v1/courts/:id/availability (§4.4) — public, never cached (§2.5). */
export const courtRouter = Router();

courtRouter.get('/:id/availability', async (req: Request, res: Response) => {
  const { from, days } = availabilityQuerySchema.parse(req.query);
  const court = await getBookableCourt(String(req.params.id));
  const result = await computeAvailability(court, from ?? nowNPT().date, days);
  res.setHeader('Cache-Control', 'no-store');
  res.json(ok(result));
});
