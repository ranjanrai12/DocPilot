import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { env } from '../../config/env.js';
import { SignupSchema, LoginSchema } from './auth.schema.js';
import * as ctrl from './auth.controller.js';

const router = Router();

// Per-IP rate limit on the unauthenticated credential endpoints (brute-force /
// credential-stuffing mitigation). Keyed by IP since there's no workspace yet.
const authLimiter = rateLimit({
  bucket: 'auth',
  limit: env.RATE_LIMIT_AUTH_PER_MIN,
  windowSec: 60,
  keyOn: 'ip',
});

router.post('/signup', authLimiter, validate(SignupSchema), ctrl.signup);
router.post('/login', authLimiter, validate(LoginSchema), ctrl.login);
router.post('/refresh', authLimiter, ctrl.refresh);
router.post('/logout', ctrl.logout);
router.get('/me', requireAuth, ctrl.me);

export default router;
