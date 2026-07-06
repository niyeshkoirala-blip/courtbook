import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../errors.js';

/**
 * The single validation middleware (blueprint §4.1): shared Zod schema at the
 * route boundary. Parsed (coerced/stripped) data replaces req.body, so
 * downstream code only ever sees validated shapes — also the NoSQL-injection
 * guard from §8 (queries are built from these primitives only).
 */
export function validate(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Express 5 leaves req.body undefined when no body was sent
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      next(
        new AppError(
          'VALIDATION',
          422,
          'Invalid input',
          result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        ),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}
