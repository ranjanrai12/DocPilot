import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { CreateConversationBody, AskBody } from './chat.schema.js';
import * as ctrl from './chat.controller.js';

const router = Router();
router.use(requireAuth);

router.post('/', validate(CreateConversationBody), ctrl.create);
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.delete('/:id', ctrl.remove);
router.post('/:id/messages', validate(AskBody), ctrl.ask);

export default router;
