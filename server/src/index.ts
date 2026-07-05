import { createApp } from './app.js';
import { config } from './core/config.js';
import { connectDb, disconnectDb } from './core/db.js';
import { logger } from './core/logger.js';

/** Boot: DB first (fail fast), then HTTP. Graceful shutdown for Render deploys. */
async function main(): Promise<void> {
  await connectDb();
  const server = createApp().listen(config.port, () => {
    logger.info({ port: config.port, env: config.env, version: config.version }, 'api listening');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
    // ponytail: 10s hard-exit guard so a stuck connection can't hang a deploy
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
