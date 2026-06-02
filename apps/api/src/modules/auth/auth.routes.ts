import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { SignupSchema, LoginSchema } from './auth.schema.js';
import * as ctrl from './auth.controller.js';

const router = Router();

router.post('/signup', validate(SignupSchema), ctrl.signup);
router.post('/login', validate(LoginSchema), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);
router.get('/me', requireAuth, ctrl.me);

export default router;
