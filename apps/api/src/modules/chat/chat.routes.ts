import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { env } from '../../config/env.js';
import { CreateConversationBody, AskBody } from './chat.schema.js';
import * as ctrl from './chat.controller.js';

const router = Router();
router.use(requireAuth);

router.post('/', validate(CreateConversationBody), ctrl.create);
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.delete('/:id', ctrl.remove);
// Chat is the most expensive endpoint (LLM + embeddings) — rate-limit per workspace.
router.post(
  '/:id/messages',
  rateLimit({ bucket: 'chat', limit: env.RATE_LIMIT_CHAT_PER_MIN, windowSec: 60 }),
  validate(AskBody),
  ctrl.ask,
);

export default router;
