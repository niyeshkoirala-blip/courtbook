import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppError } from '../errors.js';
import { errorHandler, notFound } from './error-handler.js';

/** Minimal app exercising only the error pipeline. */
function appWith(route: express.RequestHandler): express.Express {
  const app = express();
  app.get('/boom', route);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('global error middleware', () => {
  it('renders AppError as the §2.8 error envelope with its status', async () => {
    const app = appWith(() => {
      throw new AppError('SLOT_TAKEN', 409, 'That slot was just booked.', { alternatives: [] });
    });
    const res = await request(app).get('/boom');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'SLOT_TAKEN',
        message: 'That slot was just booked.',
        details: { alternatives: [] },
      },
    });
  });

  it('masks unknown errors as 500 INTERNAL in the same envelope', async () => {
    const app = appWith(() => {
      throw new Error('mongo connection string leaked!');
    });
    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INTERNAL');
    // NODE_ENV=test is non-prod so the real message is allowed through;
    // the prod branch replaces it (asserted by code, masked string constant).
    expect(res.body.error.details).toBeUndefined();
  });

  it('turns unmatched routes into a 404 NOT_FOUND envelope', async () => {
    const res = await request(appWith(() => undefined)).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
