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
import { authRouter } from './modules/auth/auth.routes.js';
import { venueRouter } from './modules/venues/venue.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { courtRouter } from './modules/courts/court.routes.js';
import { bookingRouter } from './modules/bookings/booking.routes.js';
import { paymentRouter } from './modules/payments/payment.routes.js';
import { ownerRouter } from './modules/owner/owner.routes.js';
import { assistantRouter } from './modules/assistant/assistant.routes.js';
import { homeRouter } from './modules/home/home.routes.js';

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

  app.use('/api/v1', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/venues', venueRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/courts', courtRouter);
  app.use('/api/v1', bookingRouter);
  app.use('/api/v1/payments', paymentRouter);
  app.use('/api/v1/owner', ownerRouter);
  app.use('/api/v1/assistant', assistantRouter);
  app.use('/api/v1/home', homeRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
