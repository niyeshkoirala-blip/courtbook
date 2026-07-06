/**
 * @courtbook/shared — single source of truth for types/schemas used by both
 * client and server (blueprint §2.2).
 */
export * from './auth.js';
export * from './venues.js';
export * from './bookings.js';
export * from './npt.js';

/** Standard API response envelope (blueprint §2.8). */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    /** Machine-readable enum, e.g. "SLOT_TAKEN" — frontend maps to friendly copy. */
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Payload of GET /api/v1/health (blueprint §4.4 System). */
export interface HealthStatus {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  uptime: number;
  version: string;
}
