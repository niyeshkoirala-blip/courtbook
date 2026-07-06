import type { Request, Response } from 'express';
import { myBookingsQuerySchema } from '@courtbook/shared';
import { ok } from '../../core/errors.js';
import * as bookingService from './booking.service.js';

export async function create(req: Request, res: Response): Promise<void> {
  const { booking, paymentOptions } = await bookingService.createBooking(req.body, req.user!.id);
  res.status(201).json(ok({ ...booking, paymentOptions }));
}

export async function get(req: Request, res: Response): Promise<void> {
  res.json(ok(await bookingService.getBooking(String(req.params.id), req.user!)));
}

export async function cancel(req: Request, res: Response): Promise<void> {
  res.json(
    ok(await bookingService.cancelBooking(String(req.params.id), req.user!.id, req.body.reason)),
  );
}

export async function listMine(req: Request, res: Response): Promise<void> {
  const query = myBookingsQuerySchema.parse(req.query);
  const { bookings, nextCursor } = await bookingService.listMyBookings(req.user!.id, query);
  res.json(ok(bookings, nextCursor ? { nextCursor } : undefined));
}

export async function walkin(req: Request, res: Response): Promise<void> {
  res.status(201).json(ok(await bookingService.createWalkin(req.body, req.user!.id)));
}

export async function createBlock(req: Request, res: Response): Promise<void> {
  res.status(201).json(ok(await bookingService.createBlock(req.body, req.user!.id)));
}

export async function deleteBlock(req: Request, res: Response): Promise<void> {
  await bookingService.deleteBlock(String(req.params.id), req.user!.id);
  res.status(204).end();
}
