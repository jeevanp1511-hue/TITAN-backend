import { Router } from 'express';
import { getAdminDashboard, getUserDashboard } from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

router.use(authenticate);

router.get('/admin', authorize('admin'), getAdminDashboard);
router.get('/user', getUserDashboard);

export default router;
