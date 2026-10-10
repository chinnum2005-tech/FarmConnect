import { Router } from 'express';
import { getAllProducts, createProduct, getMyProducts } from '../controllers/product.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public route - get all products for marketplace
router.get('/', getAllProducts);

// Protected routes
router.use(authenticate);

// Get farmer's products
router.get('/my-products', authorize('FARMER', 'ADMIN'), getMyProducts);

// Create new product
router.post('/', authorize('FARMER', 'ADMIN'), createProduct);

export default router;
