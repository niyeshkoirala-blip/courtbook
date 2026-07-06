import { Router } from 'express';
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from '@courtbook/shared';
import { validate } from '../../core/middleware/validate.js';
import { requireAuth } from '../../core/middleware/auth.js';
import { authRateLimiter, emailFlowRateLimiter } from '../../core/middleware/rate-limit.js';
import * as ctrl from './auth.controller.js';

/** /api/v1/auth (blueprint §4.4). Express 5 forwards async throws itself. */
export const authRouter = Router();

authRouter.post('/register', authRateLimiter, validate(registerSchema), ctrl.register);
authRouter.post('/login', authRateLimiter, validate(loginSchema), ctrl.login);
authRouter.post('/refresh', ctrl.refresh);
authRouter.post('/logout', requireAuth, ctrl.logout);
authRouter.post('/verify-email', validate(tokenSchema), ctrl.verifyEmail);
// not in the §4.4 table, but §6.3's resend UI needs it — logged in PROGRESS
authRouter.post(
  '/resend-verification',
  emailFlowRateLimiter,
  validate(emailOnlySchema),
  ctrl.resendVerification,
);
authRouter.post(
  '/forgot-password',
  emailFlowRateLimiter,
  validate(emailOnlySchema),
  ctrl.forgotPassword,
);
authRouter.post('/reset-password', validate(resetPasswordSchema), ctrl.resetPassword);
