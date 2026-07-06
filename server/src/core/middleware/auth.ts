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

/** For public routes with owner/admin extras (§7.5) — absent token is fine, bad token isn't. */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.headers.authorization) {
    next();
    return;
  }
  requireAuth(req, res, next);
}

/** Role gate on top of requireAuth. Role alone is never sufficient — services still re-check ownership (§2.7). */
export function requireRole(role: 'owner' | 'admin') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      next(new AppError('FORBIDDEN', 403, 'Insufficient permissions'));
      return;
    }
    next();
  };
}
