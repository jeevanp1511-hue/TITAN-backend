import { Router } from 'express';
import { getMembers, updateMemberStatus } from '../controllers/memberController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

router.use(authenticate);

// Get members for a network
router.get('/:networkId', getMembers);

// Update member status (suspend/activate - Admin only)
router.patch('/:networkId/:memberId', authorize('admin'), updateMemberStatus);

export default router;
