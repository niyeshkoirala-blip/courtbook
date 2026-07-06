import type { Request, Response } from 'express';
import { venueQuerySchema } from '@courtbook/shared';
import { ok } from '../../core/errors.js';
import * as venueService from './venue.service.js';

export async function list(req: Request, res: Response): Promise<void> {
  // query strings validated here (validate() covers bodies); ZodError → 422
  const query = venueQuerySchema.parse(req.query);
  const { venues, nextCursor } = await venueService.listVenues(query);
  res.json(ok(venues, nextCursor ? { nextCursor } : undefined));
}

export async function getBySlug(req: Request, res: Response): Promise<void> {
  res.json(ok(await venueService.getVenueBySlug(String(req.params.slug), req.user)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(ok(await venueService.createVenue(req.body, req.user!.id)));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(ok(await venueService.updateVenue(String(req.params.id), req.user!.id, req.body)));
}

export async function publish(req: Request, res: Response): Promise<void> {
  res.json(ok(await venueService.publishVenue(String(req.params.id), req.user!.id)));
}

export async function signPhotos(req: Request, res: Response): Promise<void> {
  res.json(ok(await venueService.signPhotoUpload(String(req.params.id), req.user!.id)));
}
