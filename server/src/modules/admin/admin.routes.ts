import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { venueRejectSchema } from '@courtbook/shared';
import { ok } from '../../core/errors.js';
import { requireAuth, requireRole } from '../../core/middleware/auth.js';
import { validate } from '../../core/middleware/validate.js';
import * as adminService from './admin.service.js';

/**
 * /api/v1/admin — M2 slice: the venue approval queue (§4.4 Admin).
 * User management, flags, audit viewer arrive with the admin milestone.
 */
export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('admin'));

const statusQuery = z.object({
  status: z.enum(['draft', 'pending_review', 'approved', 'rejected']).default('pending_review'),
});

adminRouter.get('/venues', async (req: Request, res: Response) => {
  const { status } = statusQuery.parse(req.query);
  res.json(ok(await adminService.listVenuesByStatus(status)));
});

adminRouter.post('/venues/:id/approve', async (req: Request, res: Response) => {
  res.json(ok(await adminService.approveVenue(String(req.params.id), actor(req))));
});

adminRouter.post(
  '/venues/:id/reject',
  validate(venueRejectSchema),
  async (req: Request, res: Response) => {
    res.json(
      ok(await adminService.rejectVenue(String(req.params.id), req.body.reason, actor(req))),
    );
  },
);

function actor(req: Request): { id: string; ip?: string } {
  return { id: req.user!.id, ...(req.ip && { ip: req.ip }) };
}
