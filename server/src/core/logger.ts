import { createRequire } from 'node:module';
import { pino } from 'pino';
import { config } from './config.js';

/**
 * JSON logging via pino (blueprint §2.12). No PII in logs: emails/auth
 * material are redacted at the logger level so a sloppy log call can't leak.
 * Silent in tests to keep vitest output readable; human-readable pretty
 * output in local dev (pino-pretty is a devDependency — prod stays raw JSON).
 */

// Only pretty-print when pino-pretty is actually installed. The prod image
// prunes devDependencies, so this is false there and we emit raw JSON — a stray
// NODE_ENV can no longer crash the server over a missing pretty printer.
const prettyInstalled = (() => {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
})();

export const logger = pino({
  level: config.isTest ? 'silent' : config.logLevel,
  ...(config.env !== 'production' &&
    prettyInstalled && {
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
