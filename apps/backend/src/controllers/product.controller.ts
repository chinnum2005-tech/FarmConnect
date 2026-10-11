import { Response } from 'express';
import prisma from '../database/prisma';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { generateQRCode } from '../services/qrService';

// Helper function to get default market price per kg
export function getDefaultCropPrice(cropType: string, name: string): number {
  const n = (name || '').toLowerCase();
  if (n.includes('tomato')) return 40;
  if (n.includes('potato')) return 30;
  if (n.includes('onion')) return 35;
  if (n.includes('wheat')) return 45;
  if (n.includes('rice') || n.includes('basmati')) return 65;
  if (n.includes('corn') || n.includes('maize')) return 30;
  if (n.includes('apple')) return 120;
  if (n.includes('mango')) return 150;
  if (n.includes('spice') || n.includes('chili') || n.includes('turmeric')) return 180;
  if (cropType === 'WHEAT') return 45;
  if (cropType === 'RICE') return 60;
  if (cropType === 'CORN') return 30;
  if (cropType === 'SOYBEANS') return 55;
  if (cropType === 'BARLEY') return 40;
  return 50;
}

// Helper function to get emoji for crop type and name
export function getEmojiForCrop(cropType: string, name?: string): string {
  const n = (name || '').toLowerCase();
  if (n.includes('tomato')) return '🍅';
  if (n.includes('potato')) return '🥔';
  if (n.includes('onion')) return '🧅';
  if (n.includes('apple')) return '🍎';
  if (n.includes('mango')) return '🥭';
  if (n.includes('banana')) return '🍌';
  if (n.includes('orange')) return '🍊';
  if (n.includes('carrot')) return '🥕';
  if (n.includes('chili') || n.includes('pepper')) return '🌶️';
  if (n.includes('corn') || n.includes('maize')) return '🌽';
  if (n.includes('rice') || n.includes('basmati') || n.includes('paddy')) return '🌾';
  if (n.includes('wheat')) return '🌾';
  if (n.includes('honey')) return '🍯';
  if (n.includes('milk') || n.includes('dairy')) return '🥛';

  const emojis: Record<string, string> = {
    RICE: '🌾',
    WHEAT: '🌾',
    CORN: '🌽',
    SOYBEANS: '🫘',
    BARLEY: '🌾',
    OATS: '🌾',
    CANOLA: '🌻',
    SORGHUM: '🌾',
    OTHER: '🥬',
  };
  return emojis[cropType] || '🥬';
}

// Ensure an active Product listing exists for any harvested crop
export async function ensureProductForHarvestedCrop(cropId: string) {
  try {
    const crop = await prisma.crop.findUnique({
      where: { id: cropId },
      include: {
        farm: {
          include: {
            user: true,
          }
        },
        products: {
          where: { status: 'ACTIVE' }
        }
      }
    });

    if (!crop || crop.growthStage !== 'HARVESTED') return null;
    if (crop.products && crop.products.length > 0) {
      return crop.products[0];
    }

    const defaultPrice = getDefaultCropPrice(crop.type, crop.name);
    const quantity = crop.actualYield || crop.estimatedYield || 100;
    const sku = `PROD-${crop.id.slice(-6).toUpperCase()}-${Date.now().toString(36).slice(-4)}`;

    const product = await prisma.product.create({
      data: {
        name: crop.name,
        sku,
        cropId: crop.id,
        quantity: Number(quantity) || 100,
        price: defaultPrice,
        rating: 5.0,
        packagingDate: new Date(),
        batchNumber: crop.qrCode || `BATCH-${crop.id.slice(0, 8).toUpperCase()}`,
        storageLocation: (crop.farm?.location as any)?.address || 'Farm Warehouse',
        status: 'ACTIVE',
      }
    });

    return product;
  } catch (err: any) {
    console.error(`Failed to auto-provision product for crop ${cropId}:`, err);
    return null;
  }
}

// Get all products (for consumer marketplace)
export const getAllProducts = async (req: AuthRequest, res: Response) => {
  try {
    // 1. Auto-sync: Find any crops with growthStage: 'HARVESTED' that do not have an active Product
    const harvestedCrops = await prisma.crop.findMany({
      where: {
        growthStage: 'HARVESTED',
      },
      select: { id: true }
    });

    for (const crop of harvestedCrops) {
      await ensureProductForHarvestedCrop(crop.id);
    }

    // 2. Fetch all active products
    const products = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        crop: {
          include: {
            farm: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Format products for marketplace
    const formattedProducts = products.map(product => {
      const farmerFirstName = product.crop?.farm?.user?.firstName || 'Local';
      const farmerLastName = product.crop?.farm?.user?.lastName || 'Farmer';
      return {
        id: product.id,
        cropId: product.cropId,
        name: product.name,
        farmName: `${farmerFirstName} ${farmerLastName}'s Farm`,
        price: product.price,
        unit: `1 kg`,
        availableQuantity: product.quantity,
        rating: product.rating,
        image: getEmojiForCrop(product.crop?.type || 'OTHER', product.name),
        certified: product.crop?.farm?.certification ? true : false,
        location: product.storageLocation || 'Available now',
        cropType: product.crop?.type || 'OTHER',
        batchNumber: product.batchNumber,
      };
    });

    res.json({
      success: true,
      data: formattedProducts,
    });
  } catch (error) {
    console.error('Failed to fetch products:', error);
    throw new AppError('Failed to fetch products', 500);
  }
};

// Create a new product (from harvested crop)
export const createProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { name, cropId, quantity, batchNumber, expiryDate, storageLocation, price } = req.body;

    // Verify crop belongs to user
    const crop = await prisma.crop.findUnique({
      where: { id: cropId },
      include: { farm: true }
    });

    if (!crop) {
      throw new AppError('Crop not found', 404);
    }

    if (crop.farm.userId !== req.user?.id) {
      throw new AppError('Unauthorized to create product from this crop', 403);
    }

    // Generate SKU
    const sku = `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Generate verification URL for QR code
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verificationUrl = `${frontendUrl}/verify/${cropId}`;

    // Generate QR code as base64
    const qrCode = await generateQRCode(verificationUrl, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'H',
    });

    const product = await prisma.product.create({
      data: {
        name,
        sku,
        cropId,
        quantity,
        price: price ? parseFloat(price) : 0.0,
        rating: 5.0, // default rating for new products
        packagingDate: new Date(),
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        batchNumber,
        storageLocation,
        status: 'ACTIVE',
        // Store QR code in metadata (you can add this field to schema if needed)
      },
      include: {
        crop: true
      }
    });

    res.status(201).json({
      success: true,
      message: 'Product created with QR code',
      data: {
        ...product,
        qrCode,
        verificationUrl,
      },
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to create product', 500);
  }
};

// Get farmer's products
export const getMyProducts = async (req: AuthRequest, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        crop: {
          farm: {
            userId: req.user?.id
          }
        }
      },
      include: {
        crop: {
          include: {
            farm: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    throw new AppError('Failed to fetch your products', 500);
  }
};
