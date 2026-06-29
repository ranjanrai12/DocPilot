import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { httpError } from '../../lib/http-error.js';
import * as ctrl from './documents.controller.js';

// Buffer the upload in memory (the worker needs the bytes to store + parse).
// Size cap enforced here; mime allow-list enforced in the controller.
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

// Translate multer's own errors into the standard error shape.
function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  multerUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(httpError(`File exceeds the ${env.MAX_UPLOAD_MB}MB limit.`, 413, 'PAYLOAD_TOO_LARGE'));
      }
      const message = err instanceof Error ? err.message : 'Upload failed.';
      return next(httpError(message, 400, 'VALIDATION_ERROR'));
    }
    next();
  });
}

const router = Router();
router.use(requireAuth);

router.post('/', uploadSingle, ctrl.upload);
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.delete('/:id', ctrl.remove);

export default router;
