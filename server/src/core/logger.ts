import { pino } from 'pino';
import { config } from './config.js';

/**
 * JSON logging via pino (blueprint §2.12). No PII in logs: emails/auth
 * material are redacted at the logger level so a sloppy log call can't leak.
 * Silent in tests to keep vitest output readable; human-readable pretty
 * output in local dev (pino-pretty is a devDependency — prod stays raw JSON).
 */
export const logger = pino({
  level: config.isTest ? 'silent' : config.logLevel,
  ...(config.env === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
  }),
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
