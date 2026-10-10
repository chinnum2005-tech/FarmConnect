import { Router } from 'express';
import { createOrder, getMyOrders, getFarmerOrders, getOrderById, updateOrderStatus } from '../controllers/order.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Protect all routes
router.use(authenticate);

// Create new order (Consumers & Admins)
router.post('/', authorize('CONSUMER', 'ADMIN'), createOrder);

// Get consumer's orders
router.get('/my-orders', authorize('CONSUMER', 'ADMIN'), getMyOrders);

// Get farmer's orders
router.get('/farmer-orders', authorize('FARMER', 'ADMIN'), getFarmerOrders);

// Get single order with authorization check
router.get('/:orderId', getOrderById);

// Update order status
router.patch('/:orderId/status', updateOrderStatus);

export default router;
