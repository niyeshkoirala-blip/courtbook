import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { nowNPT } from '@courtbook/shared';
import { ok } from '../../core/errors.js';
import { requireAuth } from '../../core/middleware/auth.js';
import * as ownerService from './owner.service.js';

/**
 * /api/v1/owner — dashboard reads (§3.4/§3.5). Walk-ins and blocks live in
 * the bookings module; this router is the owner's read side.
 */
export const ownerRouter = Router();
ownerRouter.use(requireAuth);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeQuery = z
  .object({ from: dateStr.optional(), to: dateStr.optional() })
  .transform(({ from, to }) => {
    const today = nowNPT().date;
    return { from: from ?? today, to: to ?? from ?? today };
  })
  .refine((r) => r.from <= r.to, { message: 'from must be before to' });

ownerRouter.get('/venues', async (req: Request, res: Response) => {
  res.json(ok(await ownerService.listOwnerVenues(req.user!.id)));
});

ownerRouter.get('/venues/:id/bookings', async (req: Request, res: Response) => {
  const { from, to } = rangeQuery.parse(req.query);
  res.json(ok(await ownerService.listVenueBookings(String(req.params.id), req.user!.id, from, to)));
});

ownerRouter.get('/venues/:id/stats', async (req: Request, res: Response) => {
  const { from, to } = rangeQuery.parse(req.query);
  res.json(ok(await ownerService.venueStats(String(req.params.id), req.user!.id, from, to)));
});
