import type { Request, Response } from 'express';
import { ok } from '../../core/errors.js';
import * as homeService from './home.service.js';

/** GET /api/v1/home — public landing-page summary. */
export async function summary(_req: Request, res: Response): Promise<void> {
  res.json(ok(await homeService.getHomeSummary()));
}
