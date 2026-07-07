import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  esewaCallbackSchema,
  khaltiCallbackSchema,
  paymentInitiateSchema,
} from '@courtbook/shared';
import { ok } from '../../core/errors.js';
import { requireAuth } from '../../core/middleware/auth.js';
import { validate } from '../../core/middleware/validate.js';
import * as paymentService from './payment.service.js';

/**
 * /api/v1/payments (§4.4). Callbacks are signature/lookup-gated, not
 * user-authenticated (§4.3: no user rate limit on webhooks) — the SPA relays
 * gateway redirects here, but crypto/API verification is the trust boundary.
 */
export const paymentRouter = Router();

paymentRouter.post('/initiate', requireAuth, validate(paymentInitiateSchema), initiate);
paymentRouter.post('/callback/esewa', validate(esewaCallbackSchema), esewaCallback);
paymentRouter.post('/callback/khalti', validate(khaltiCallbackSchema), khaltiCallback);
paymentRouter.get('/:id', requireAuth, getOne);

async function initiate(req: Request, res: Response): Promise<void> {
  res.json(ok(await paymentService.initiatePayment(req.body, req.user!.id)));
}

async function esewaCallback(req: Request, res: Response): Promise<void> {
  res.json(ok(await paymentService.handleCallback('esewa', req.body)));
}

async function khaltiCallback(req: Request, res: Response): Promise<void> {
  res.json(ok(await paymentService.handleCallback('khalti', req.body)));
}

async function getOne(req: Request, res: Response): Promise<void> {
  res.json(ok(await paymentService.getPayment(String(req.params.id), req.user!.id)));
}
