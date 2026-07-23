import type { Request, Response } from 'express';
import { ok } from '../../core/errors.js';
import * as reviewService from './review.service.js';

export async function list(req: Request, res: Response): Promise<void> {
  res.json(ok(await reviewService.listReviews(String(req.params.id))));
}

export async function upsert(req: Request, res: Response): Promise<void> {
  res.json(ok(await reviewService.upsertReview(String(req.params.id), req.user!.id, req.body)));
}
