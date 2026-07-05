import { pino } from 'pino';
import { config } from './config.js';

/**
 * JSON logging via pino (blueprint §2.12). No PII in logs: emails/auth
 * material are redacted at the logger level so a sloppy log call can't leak.
 * Silent in tests to keep vitest output readable.
 */
export const logger = pino({
  level: config.isTest ? 'silent' : config.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.email',
      '*.passwordHash',
    ],
    censor: '[redacted]',
  },
});
