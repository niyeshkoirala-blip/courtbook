import { Router } from 'express';
import * as homeCtrl from './home.controller.js';

/** /api/v1/home — public landing-page summary (no auth). */
export const homeRouter = Router();

homeRouter.get('/', homeCtrl.summary);
