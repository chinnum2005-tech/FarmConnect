import { Router } from 'express';
import { verifyProduct, generateQRCode, verifyOnChainProduce } from '../controllers/verify.controller';

const router = Router();

// GET & POST /api/v1/verify/on-chain/:identifier - Independent on-chain blockchain verification (public)
router.get('/on-chain/:identifier', verifyOnChainProduce);
router.post('/on-chain/:identifier', verifyOnChainProduce);

// GET /api/v1/verify/:qrCode - Verify product by QR code / DB history (public)
router.get('/:qrCode', verifyProduct);

// POST /api/v1/verify/generate/:cropId - Generate QR code (requires auth in controller)
router.post('/generate/:cropId', generateQRCode);

export default router;
