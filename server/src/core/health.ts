import { Router } from 'express';
import type { HealthStatus } from '@courtbook/shared';
import { pingDb } from './db.js';
import { ok } from './errors.js';
import { config } from './config.js';

/**
 * GET /api/v1/health (blueprint §4.4 System). Render's deploy gate and
 * UptimeRobot hit this: 200 only when the DB answers a live ping.
 */
export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const db = await pingDb();
  const body: HealthStatus = {
    status: db === 'up' ? 'ok' : 'degraded',
    db,
    uptime: Math.round(process.uptime()),
    version: config.version,
  };
  res.status(db === 'up' ? 200 : 503).json(ok(body));
});
