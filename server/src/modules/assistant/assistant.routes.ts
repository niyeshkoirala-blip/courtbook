import { Router } from 'express';
import type { Request, Response } from 'express';
import { assistantChatSchema } from '@courtbook/shared';
import { ok } from '../../core/errors.js';
import { optionalAuth } from '../../core/middleware/auth.js';
import { validate } from '../../core/middleware/validate.js';
import { assistantRateLimiter } from '../../core/middleware/rate-limit.js';
import * as assistantService from './assistant.service.js';

/** POST /api/v1/assistant/chat (§4.4) — public; booking drafts need auth (§7.7). */
export const assistantRouter = Router();

assistantRouter.post(
  '/chat',
  optionalAuth,
  assistantRateLimiter,
  validate(assistantChatSchema),
  async (req: Request, res: Response) => {
    const { sessionId, message } = req.body as { sessionId: string; message: string };
    res.json(ok(await assistantService.chat(sessionId, message, { userId: req.user?.id })));
  },
);
