import mongoose from 'mongoose';
import { config } from './config.js';
import { logger } from './logger.js';

/** Connect once at boot; mongoose manages the pool (§9: default pool 10). */
export async function connectDb(uri: string = config.mongoUri): Promise<void> {
  await mongoose.connect(uri);
  logger.info({ db: mongoose.connection.name }, 'mongodb connected');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

/** Live ping for /health — readyState alone can lie after a silent drop. */
export async function pingDb(): Promise<'up' | 'down'> {
  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return 'down';
    await mongoose.connection.db.admin().command({ ping: 1 });
    return 'up';
  } catch {
    return 'down';
  }
}
