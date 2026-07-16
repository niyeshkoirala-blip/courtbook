import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { registerSchema, venueRejectSchema } from '@courtbook/shared';
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

// Platform overview: total futsals, owners, bookings, revenue (§4.4 /admin/stats).
adminRouter.get('/stats', async (_req: Request, res: Response) => {
  res.json(ok(await adminService.platformStats()));
});

adminRouter.get('/venues', async (req: Request, res: Response) => {
  const { status } = statusQuery.parse(req.query);
  res.json(ok(await adminService.listVenuesByStatus(status)));
});

// Every futsal (any status) for the management table.
adminRouter.get('/venues/all', async (_req: Request, res: Response) => {
  res.json(ok(await adminService.listAllVenues()));
});

// Remove a futsal (soft delete).
adminRouter.delete('/venues/:id', async (req: Request, res: Response) => {
  await adminService.removeVenue(String(req.params.id), actor(req));
  res.status(204).end();
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

// ── User management: owner approval queue + admin provisioning (§3.5, §8) ──

adminRouter.get('/owner-requests', async (_req: Request, res: Response) => {
  res.json(ok(await adminService.listOwnerRequests()));
});

adminRouter.post('/owner-requests/:id/approve', async (req: Request, res: Response) => {
  res.json(ok(await adminService.approveOwner(String(req.params.id), actor(req))));
});

adminRouter.post(
  '/owner-requests/:id/reject',
  validate(venueRejectSchema), // same { reason } shape
  async (req: Request, res: Response) => {
    res.json(
      ok(await adminService.rejectOwner(String(req.params.id), req.body.reason, actor(req))),
    );
  },
);

// Create a brand-new admin (name/email/password); accountType from the schema is ignored.
adminRouter.post('/users', validate(registerSchema), async (req: Request, res: Response) => {
  res.status(201).json(ok(await adminService.createAdmin(req.body, actor(req))));
});

function actor(req: Request): { id: string; ip?: string } {
  return { id: req.user!.id, ...(req.ip && { ip: req.ip }) };
}
