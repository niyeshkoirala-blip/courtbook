import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../errors.js';
import { config } from '../config.js';

declare global {
  // the standard way to type req.user — Express's types are namespace-based
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth from the JWT claims (§2.7). */
      user?: { id: string; role: 'player' | 'owner' | 'admin' };
    }
  }
}

/** Guards routes that need a valid 15-min access token (§2.7). */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError('UNAUTHENTICATED', 401, 'Missing access token'));
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as {
      sub: string;
      role: 'player' | 'owner' | 'admin';
    };
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError('UNAUTHENTICATED', 401, 'Invalid or expired access token'));
  }
}
