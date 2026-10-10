import { Router } from 'express';
import {
  getProductTraceability,
  addSupplyChainEvent,
  getRecentEvents,
  getAllEvents,
  getMyProductEvents,
} from '../controllers/supplyChain.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/trace/:productId', getProductTraceability);
router.get('/recent', getRecentEvents);
router.get('/all', getAllEvents); // For Blockchain Explorer (supports ?search=&limit=&offset=)

// Protected routes
router.use(authenticate);
router.get('/my-products', getMyProductEvents);
router.post('/add', authorize('FARMER', 'DISTRIBUTOR', 'ADMIN'), addSupplyChainEvent);

export default router;
