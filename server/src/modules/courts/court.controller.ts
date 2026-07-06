import type { Request, Response } from 'express';
import { ok } from '../../core/errors.js';
import * as courtService from './court.service.js';

export async function create(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(ok(await courtService.createCourt(String(req.params.id), req.user!.id, req.body)));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(
    ok(
      await courtService.updateCourt(
        String(req.params.id),
        String(req.params.courtId),
        req.user!.id,
        req.body,
      ),
    ),
  );
}

export async function remove(req: Request, res: Response): Promise<void> {
  await courtService.deleteCourt(String(req.params.id), String(req.params.courtId), req.user!.id);
  res.status(204).end();
}
