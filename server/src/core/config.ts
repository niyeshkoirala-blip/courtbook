import { readFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * Env config (blueprint §10). Parsed once at startup — fail fast with a
 * readable message rather than crashing mid-request later.
 * Only vars M0 consumes are required; later-milestone keys are optional
 * and documented in .env.example.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z.string().min(1).default('mongodb://localhost:27017/courtbook'),
  /** Comma-separated SPA origins for the CORS allowlist (§4.2). */
  CLIENT_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // M1+ (auth) — validated as required by the milestones that use them.
  JWT_SECRET: z.string().optional(),
  REFRESH_SECRET: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid environment configuration — ${issues}`);
}

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

export const config = {
  env: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  mongoUri: parsed.data.MONGO_URI,
  corsOrigins: parsed.data.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
  logLevel: parsed.data.LOG_LEVEL,
  version: pkg.version,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};
