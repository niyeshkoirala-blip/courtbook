import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, fail } from '../errors.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/** 404 for unmatched routes — funnels into the same envelope. */
export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('NOT_FOUND', 404, `Route ${req.method} ${req.path} not found`));
}

/**
 * The one global error middleware (blueprint §4.1). AppError → its envelope;
 * anything else → masked 500 (internals are logged, never sent to clients).
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // Express identifies error middleware by arity — the 4th param must exist.
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.status).json(fail(err.code, err.message, err.details));
    return;
  }

  // Controllers may schema.parse() query/params directly — same 422 envelope
  if (err instanceof ZodError) {
    res.status(422).json(
      fail(
        'VALIDATION',
        'Invalid input',
        err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      ),
    );
    return;
  }

  logger.error({ err, reqId: req.id }, 'unhandled error');
  const message = config.isProd
    ? 'Something went wrong on our end.'
    : err instanceof Error
      ? err.message
      : String(err);
  res.status(500).json(fail('INTERNAL', message));
}
