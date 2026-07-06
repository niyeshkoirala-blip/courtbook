import type { Request, Response } from 'express';
import { AppError, ok } from '../../core/errors.js';
import { config } from '../../core/config.js';
import * as authService from './auth.service.js';
import type { AuthResult } from './auth.service.js';

/**
 * HTTP layer only (§2.3): cookies, headers, status codes. Business rules
 * live in auth.service.
 */

export const REFRESH_COOKIE = 'refresh_token';
// Path-scoped: the browser only sends it to /auth/* routes (§2.7)
const COOKIE_PATH = '/api/v1/auth';

function setRefreshCookie(res: Response, token: string, expires: Date): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: COOKIE_PATH,
    expires,
  });
}

function sendAuthResult(res: Response, result: AuthResult, status = 200): void {
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  res.status(status).json(ok({ accessToken: result.accessToken, user: result.user }));
}

function sessionMeta(req: Request): authService.SessionMeta {
  return {
    ...(req.ip && { ip: req.ip }),
    ...(req.headers['user-agent'] && { userAgent: req.headers['user-agent'] }),
  };
}

export async function register(req: Request, res: Response): Promise<void> {
  const user = await authService.register(req.body);
  res.status(201).json(ok({ user }));
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  sendAuthResult(res, await authService.verifyEmail(req.body.token, sessionMeta(req)));
}

export async function resendVerification(req: Request, res: Response): Promise<void> {
  await authService.resendVerification(req.body.email);
  res.json(ok({ message: 'If that account needs verification, an email is on its way.' }));
}

export async function login(req: Request, res: Response): Promise<void> {
  sendAuthResult(res, await authService.login(req.body, sessionMeta(req)));
}

export async function refresh(req: Request, res: Response): Promise<void> {
  // §2.7: refresh additionally checks Origin against the allowlist (CSRF).
  // Absent Origin is allowed — non-browser clients don't send one.
  const origin = req.headers.origin;
  if (origin && !config.corsOrigins.includes(origin)) {
    throw new AppError('ORIGIN_FORBIDDEN', 403, 'Request origin not allowed');
  }
  const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
  if (!token) throw new AppError('REFRESH_INVALID', 401, 'Session expired — please log in again');
  sendAuthResult(res, await authService.rotateRefresh(token, sessionMeta(req)));
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
  if (token) await authService.logout(token);
  res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  res.status(204).end();
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  await authService.forgotPassword(req.body.email);
  // uniform response — no account enumeration (§8)
  res.json(ok({ message: 'If that email has an account, a reset link is on its way.' }));
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  await authService.resetPassword(req.body.token, req.body.password);
  res.json(ok({ message: 'Password updated — log in with your new password.' }));
}
