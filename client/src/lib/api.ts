import type { ApiResponse, UserDto } from '@courtbook/shared';
import { useAuth } from './auth';

/** Machine-readable API error (envelope §2.8) for UI branching. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

const BASE = '/api/v1';

async function rawRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuth.getState().accessToken;
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include', // refresh cookie rides along on /auth routes
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success)
    throw new ApiError(body.error.code, res.status, body.error.message, body.error.details);
  return body.data;
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time — concurrent 401s share the same attempt (§6.3). */
export function tryRefresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const data = await rawRequest<{ accessToken: string; user: UserDto }>('/auth/refresh', {
        method: 'POST',
      });
      useAuth.getState().setSession(data.user, data.accessToken);
      return true;
    } catch {
      useAuth.getState().clear();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/**
 * API call with the §6.3 session-expiry dance: on 401, try one refresh and
 * replay the original request; if that fails the caller sees the 401.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, init);
  } catch (err) {
    const expired = err instanceof ApiError && err.status === 401 && !path.startsWith('/auth/');
    if (expired && (await tryRefresh())) return rawRequest<T>(path, init);
    throw err;
  }
}

export const post = <T>(path: string, body?: unknown): Promise<T> =>
  api<T>(path, { method: 'POST', ...(body !== undefined && { body: JSON.stringify(body) }) });
