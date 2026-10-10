import { Router } from 'express';
import {
  createRequest,
  cancelRequest,
  getRequests,
} from '../controllers/requestController.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { createRequestSchema } from '../validators/index.js';

const router = Router();

router.use(authenticate);

// List requests for a specific network (scoped by role/membership)
router.get('/network/:networkId', getRequests);

// Submit new bandwidth request
router.post('/', validate(createRequestSchema), createRequest);

// Cancel bandwidth request
router.patch('/:id/cancel', cancelRequest);

export default router;
