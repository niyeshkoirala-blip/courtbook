import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Request-id middleware (blueprint §2.12): uuid v4 per request, honoured
 * from upstream X-Request-Id if present, echoed on the response, and picked
 * up by pino-http so every log line carries it.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
