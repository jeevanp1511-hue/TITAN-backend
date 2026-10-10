import { Router } from 'express';
import {
  createNetwork,
  getNetworks,
  getNetworkById,
  updateNetwork,
  joinNetwork,
} from '../controllers/networkController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  createNetworkSchema,
  updateNetworkSchema,
  joinNetworkSchema,
} from '../validators/index.js';

const router = Router();

router.use(authenticate);

// List accessible networks
router.get('/', getNetworks);

// Create network (Admin only)
router.post('/', authorize('admin'), validate(createNetworkSchema), createNetwork);

// Join network via invitation code (User or Admin)
router.post('/join', validate(joinNetworkSchema), joinNetwork);

// Get network details
router.get('/:id', getNetworkById);

// Update network settings (Admin only)
router.patch('/:id', authorize('admin'), validate(updateNetworkSchema), updateNetwork);

export default router;
