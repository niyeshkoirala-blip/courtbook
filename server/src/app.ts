import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { config } from './core/config.js';
import { logger } from './core/logger.js';
import { requestId } from './core/middleware/request-id.js';
import { globalRateLimiter } from './core/middleware/rate-limit.js';
import { errorHandler, notFound } from './core/middleware/error-handler.js';
import { healthRouter } from './core/health.js';

/**
 * App factory (no .listen — supertest mounts it directly).
 * Middleware order is exactly blueprint §4.2:
 * helmet → cors(allowlist) → request-id → pino-http → rateLimiter →
 * cookieParser → json(100kb) → [auth M1] → routes → notFound → errorHandler
 */
export function createApp(): express.Express {
  const app = express();

  // Render terminates TLS in front of us; trust the first proxy hop so
  // req.ip (rate-limit key) and secure cookies work.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
    }),
  );
  app.use(globalRateLimiter);
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));
  // auth(optional) middleware slots in here at M1.

  app.use('/api/v1', healthRouter);
  // Feature module routers mount here: /api/v1/auth (M1), /api/v1/venues (M2)…

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
