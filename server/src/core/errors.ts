import type { ApiError, ApiSuccess } from '@courtbook/shared';

/**
 * The only error type services are allowed to throw (blueprint §4.1,
 * Appendix coding standards). Caught by the global error middleware and
 * rendered as the §2.8 error envelope.
 */
export class AppError extends Error {
  constructor(
    /** Machine-readable enum, e.g. "SLOT_TAKEN", "VALIDATION". */
    public readonly code: string,
    /** HTTP status to respond with. */
    public readonly status: number,
    message: string,
    /** Optional structured extras (e.g. validation issues, alternatives). */
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Success envelope helper (§2.8). */
export function ok<T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> {
  return meta ? { success: true, data, meta } : { success: true, data };
}

/** Error envelope helper (§2.8). */
export function fail(code: string, message: string, details?: unknown): ApiError {
  return {
    success: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
}
