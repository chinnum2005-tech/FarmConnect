import { Router } from 'express';
import {
  getMyShipments,
  updateShipmentStatus,
  getAvailableShipments,
  claimShipment,
} from '../controllers/shipment.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Protect all shipment routes
router.use(authenticate, authorize('DISTRIBUTOR', 'ADMIN'));

// Get distributor's shipments
router.get('/my-shipments', getMyShipments);

// Get available shipments to claim
router.get('/available', getAvailableShipments);

// Claim a shipment
router.post('/claim', claimShipment);

// Update shipment status
router.post('/update', updateShipmentStatus);

export default router;
