import { Router } from 'express';
import {
  triggerRecalculation,
  getLatestAllocation,
  getAllocationHistory,
  comparePolicies,
} from '../controllers/allocationController.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { comparePoliciesSchema } from '../validators/index.js';

const router = Router();

router.use(authenticate);

// Manually trigger allocation recalculation (Admin)
router.post('/network/:networkId/run', triggerRecalculation);

// Get latest active allocation for network
router.get('/network/:networkId/latest', getLatestAllocation);

// Get allocation history for network
router.get('/network/:networkId/history', getAllocationHistory);

// Compare policies (simulation)
router.post('/compare', validate(comparePoliciesSchema), comparePolicies);

export default router;
