import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { InviteMemberBody, UpdateRoleBody } from './members.schema.js';
import * as ctrl from './members.controller.js';

const router = Router();
router.use(requireAuth);

// Any authenticated member can view the team roster.
router.get('/', ctrl.list);

// Mutations are admin-only (requireAdmin runs after requireAuth).
router.post('/', requireAdmin, validate(InviteMemberBody), ctrl.invite);
router.patch('/:id/role', requireAdmin, validate(UpdateRoleBody), ctrl.updateRole);
router.delete('/:id', requireAdmin, ctrl.remove);

export default router;
