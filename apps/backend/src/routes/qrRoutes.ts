import { Router, Request, Response } from 'express';
import { generateQRCode } from '../services/qrService';
import { authenticate } from '../middleware/auth';
import prisma from '../database/prisma';

const router = Router();

/**
 * POST /api/qr/generate
 * Generate QR code for a product/crop and persist canonical identifier
 * 
 * Request body:
 * - productId?: string (ID of the product)
 * - cropId?: string (ID of the crop)
 * - format?: 'url' | 'text' (default: 'url')
 */
router.post('/generate', authenticate, async (req: Request, res: Response) => {
  try {
    const { productId, cropId, id, type, format = 'url' } = req.body;
    
    let crop = null;
    let product = null;
    let targetId: string;
    let targetName: string;
    let canonicalIdentifier: string;

    const requestedCropId = cropId || (type === 'crop' ? id : (!productId ? id : undefined));
    const requestedProductId = productId || (type === 'product' ? id : undefined);

    if (requestedCropId) {
      crop = await prisma.crop.findUnique({
        where: { id: requestedCropId },
      });
    }

    if (!crop && (requestedProductId || id)) {
      const prodIdToFind = requestedProductId || id;
      product = await prisma.product.findUnique({
        where: { id: prodIdToFind },
        include: { crop: true },
      });
    }

    if (crop) {
      targetId = crop.id;
      targetName = crop.name;
      canonicalIdentifier = `FARMCONNECT-${crop.id}`;

      // Persist the canonical QR identifier directly against the crop record
      await prisma.crop.update({
        where: { id: crop.id },
        data: { qrCode: canonicalIdentifier }
      });
    } else if (product) {
      targetId = product.id;
      targetName = product.name;
      canonicalIdentifier = product.sku || `PROD-${product.id}`;
    } else {
      return res.status(404).json({
        success: false,
        error: 'Crop or Product not found for the provided identifier',
      });
    }

    // Ensure FRONTEND_URL is used correctly with the trace route
    const traceUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/trace/${targetId}`;
    const qrData = format === 'url' ? traceUrl : canonicalIdentifier;

    // Generate QR code
    const qrCodeImage = await generateQRCode(qrData, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'H',
    });

    res.json({
      success: true,
      data: {
        id: targetId,
        cropId: crop?.id || product?.cropId || targetId,
        productId: product?.id,
        name: targetName,
        qrCode: qrCodeImage,
        qrData,
        traceUrl,
        canonicalIdentifier,
        format,
      },
      message: 'QR code generated and persisted successfully',
    });

  } catch (error: any) {
    console.error('Error generating QR code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate QR code',
      message: error.message,
    });
  }
});

/**
 * GET /api/qr/:id
 * Get QR code for a specific product or crop
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const qrData = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify/${id}`;
    const qrCodeImage = await generateQRCode(qrData, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'H',
    });

    res.json({
      success: true,
      data: {
        id,
        qrCode: qrCodeImage,
        qrData,
      },
      message: 'QR code retrieved successfully',
    });

  } catch (error: any) {
    console.error('Error retrieving QR code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve QR code',
      message: error.message,
    });
  }
});

export default router;
