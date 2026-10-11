import { Response } from 'express';
import prisma from '../database/prisma';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { blockchainService } from '../services/blockchain.service';
import { eventLifecycleService } from '../services/eventLifecycle.service';
import { ensureProductForHarvestedCrop } from './product.controller';

/**
 * Get supply chain events for a product or crop
 */
export const getProductTraceability = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      throw new AppError('Product ID is required', 400);
    }

    const events = await prisma.supplyChainEvent.findMany({
      where: {
        OR: [
          { productId },
          { cropId: productId }
        ]
      },
      include: {
        actor: {
          select: {
            firstName: true,
            lastName: true,
            role: true,
          }
        }
      },
      orderBy: { timestamp: 'asc' },
    });

    // Format events for frontend display (including map coordinates)
    const formattedEvents = events.map(event => ({
      id: event.id,
      eventType: event.eventType,
      title: formatEventType(event.eventType),
      description: event.metadata ? JSON.parse(event.metadata).description || '' : '',
      location: event.location || 'Unknown',
      latitude: event.metadata ? JSON.parse(event.metadata).latitude || null : null,
      longitude: event.metadata ? JSON.parse(event.metadata).longitude || null : null,
      timestamp: event.timestamp,
      date: formatDate(event.timestamp),
      actor: `${event.actor.firstName} ${event.actor.lastName}`,
      actorRole: event.actor.role,
      verified: event.verified,
      transactionHash: event.transactionHash,
      metadata: event.metadata ? JSON.parse(event.metadata) : null,
    }));

    res.json({
      success: true,
      data: formattedEvents,
    });
  } catch (error) {
    throw new AppError('Failed to fetch traceability data', 500);
  }
};

/**
 * Add a supply chain event (supports both Products and Cultivated Crops)
 */
export const addSupplyChainEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, cropId, batchId, eventType, location, description, metadata, latitude, longitude } = req.body;
    const userId = req.user!.id;

    const targetId = productId || cropId || batchId;

    if (!targetId || !eventType) {
      throw new AppError('Product or Crop ID and event type are required', 400);
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(targetId);

    // 1. Look for Product first
    let product: any = null;
    let crop: any = null;

    if (isObjectId) {
      product = await prisma.product.findUnique({
        where: { id: targetId },
        include: {
          crop: {
            include: { farm: true }
          }
        }
      });
    }

    // 2. If product found, retrieve its associated crop; otherwise look for Crop directly
    if (product) {
      crop = product.crop;
    } else {
      crop = await prisma.crop.findFirst({
        where: {
          OR: [
            { qrCode: targetId },
            ...(isObjectId ? [{ id: targetId }] : [])
          ]
        },
        include: { farm: true }
      });
    }

    if (!product && !crop) {
      throw new AppError('Product or Crop not found', 404);
    }

    // Authorization check for FARMER
    const farmUserId = product?.crop?.farm?.userId || crop?.farm?.userId;
    if (req.user!.role === 'FARMER' && farmUserId && farmUserId !== userId) {
      throw new AppError('Unauthorized to add event to this produce batch', 403);
    }

    // If event corresponds to a valid GrowthStage (e.g. HARVESTED), update the crop growthStage
    if (crop) {
      const validGrowthStages = [
        'PLANTED', 'GERMINATION', 'VEGETATIVE', 'FLOWERING',
        'FRUITING', 'MATURING', 'READY_FOR_HARVEST', 'HARVESTED'
      ];
      if (validGrowthStages.includes(eventType)) {
        await prisma.crop.update({
          where: { id: crop.id },
          data: { growthStage: eventType as any }
        });
        if (eventType === 'HARVESTED') {
          await ensureProductForHarvestedCrop(crop.id);
        }
      }
    }

    const resolvedBatchId = product ? product.id : crop.id;
    const resolvedProductId = product ? product.id : undefined;
    const resolvedCropId = crop ? crop.id : undefined;

    // Create supply chain event with optional coordinates
    const metadataObj = metadata ? { ...metadata, latitude, longitude } : { description, latitude, longitude };

    // Record through honest 5-state lifecycle service
    let lifecycleResult: any;
    try {
      lifecycleResult = await eventLifecycleService.recordAndPersistEvent({
        batchId: resolvedBatchId,
        productId: resolvedProductId,
        cropId: resolvedCropId,
        eventType,
        evidence: metadataObj,
        actorId: userId,
        location: location || null,
        idempotencyKey: (req.headers && req.headers['idempotency-key'] ? String(req.headers['idempotency-key']) : undefined),
      });
    } catch (blockchainErr: any) {
      console.warn('[addSupplyChainEvent] Blockchain transaction failed or offline, off-chain event preserved:', blockchainErr?.message);
      // Retrieve the created DB event to return honest DB-only status
      const dbEvent = await prisma.supplyChainEvent.findFirst({
        where: {
          OR: [
            ...(resolvedProductId ? [{ productId: resolvedProductId }] : []),
            ...(resolvedCropId ? [{ cropId: resolvedCropId }] : [])
          ]
        },
        orderBy: { createdAt: 'desc' }
      });
      lifecycleResult = {
        eventId: dbEvent?.id || 'event-recorded',
        status: dbEvent?.chainStatus || 'RECORDED_DB',
        transactionHash: dbEvent?.transactionHash || null,
        verified: false,
        isReplay: false
      };
    }

    res.status(201).json({
      success: true,
      message: 'Supply chain event recorded successfully',
      data: {
        id: lifecycleResult.eventId,
        eventType,
        status: lifecycleResult.status,
        transactionHash: lifecycleResult.transactionHash,
        verified: lifecycleResult.verified,
        isReplay: lifecycleResult.isReplay,
      }
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to record supply chain event', 500);
  }
};

/**
 * Get recent supply chain events (for dashboard displays)
 */
export const getRecentEvents = async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const events = await prisma.supplyChainEvent.findMany({
      take: limit,
      include: {
        product: {
          include: {
            crop: {
              include: {
                farm: true,
              }
            }
          }
        },
        crop: {
          include: {
            farm: true,
          }
        },
        actor: {
          select: {
            firstName: true,
            lastName: true,
          }
        }
      },
      orderBy: { timestamp: 'desc' },
    });

    const formattedEvents = events.map(event => ({
      id: event.id,
      eventType: event.eventType,
      title: formatEventType(event.eventType),
      productName: event.product?.name || event.crop?.name || 'Produce Batch',
      farmName: event.product?.crop?.farm?.name || event.crop?.farm?.name || 'Farm',
      location: event.location || 'Unknown',
      timestamp: event.timestamp,
      actor: `${event.actor.firstName} ${event.actor.lastName}`,
      verified: event.verified,
    }));

    res.json({
      success: true,
      data: formattedEvents,
    });
  } catch (error) {
    throw new AppError('Failed to fetch recent events', 500);
  }
};

/**
 * Get ALL supply chain events for Blockchain Explorer
 * Supports search by product name, actor, event type, tx hash
 */
export const getAllEvents = async (req: AuthRequest, res: Response) => {
  try {
    const limit  = parseInt(req.query.limit  as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = (req.query.search as string) || '';

    // Build a flexible where clause for search
    const where = search
      ? {
          OR: [
            { eventType:       { equals: search.toUpperCase() as any } },
            { location:        { contains: search, mode: 'insensitive' as const } },
            { transactionHash: { contains: search, mode: 'insensitive' as const } },
            {
              product: {
                name: { contains: search, mode: 'insensitive' as const },
              },
            },
            {
              actor: {
                OR: [
                  { firstName: { contains: search, mode: 'insensitive' as const } },
                  { lastName:  { contains: search, mode: 'insensitive' as const } },
                ],
              },
            },
          ],
        }
      : {};

    const [total, events] = await Promise.all([
      prisma.supplyChainEvent.count({ where }),
      prisma.supplyChainEvent.findMany({
        where,
        take: limit,
        skip: offset,
        include: {
          product: { select: { name: true, sku: true } },
          actor: { select: { firstName: true, lastName: true, role: true } },
        },
        orderBy: { timestamp: 'desc' },
      }),
    ]);

    const formattedEvents = events.map(event => ({
      id:              event.id,
      hash:            event.transactionHash || null,
      blockNumber:     event.blockNumber     || null,
      eventType:       event.eventType,
      productId:       event.productId,
      productName:     (event as any).product?.name   || 'Unknown Product',
      productSku:      (event as any).product?.sku    || '',
      actor:           (event as any).actor ? `${(event as any).actor.firstName} ${(event as any).actor.lastName}` : 'System',
      actorRole:       (event as any).actor?.role     || 'SYSTEM',
      location:        event.location        || 'Unknown',
      timestamp:       event.timestamp,
      verified:        event.verified,
      chainStatus:     event.chainStatus,
      metadata:        event.metadata ? JSON.parse(event.metadata) : null,
    }));

    res.json({
      success: true,
      total,
      data: formattedEvents,
    });
  } catch (error) {
    throw new AppError('Failed to fetch blockchain events', 500);
  }
};

/**
 * Get supply chain events by user's products (for farmer dashboard)
 */
export const getMyProductEvents = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Find all products and crops from this farmer's farms
    const farmerProducts = await prisma.product.findMany({
      where: {
        crop: {
          farm: {
            userId,
          }
        }
      },
      select: { id: true }
    });

    const farmerCrops = await prisma.crop.findMany({
      where: {
        farm: {
          userId,
        }
      },
      select: { id: true }
    });

    const productIds = farmerProducts.map(p => p.id);
    const cropIds = farmerCrops.map(c => c.id);

    if (productIds.length === 0 && cropIds.length === 0) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const events = await prisma.supplyChainEvent.findMany({
      where: {
        OR: [
          ...(productIds.length > 0 ? [{ productId: { in: productIds } }] : []),
          ...(cropIds.length > 0 ? [{ cropId: { in: cropIds } }] : [])
        ]
      },
      include: {
        product: {
          include: {
            crop: {
              include: {
                farm: true,
              }
            }
          }
        },
        crop: {
          include: {
            farm: true,
          }
        }
      },
      orderBy: { timestamp: 'desc' },
    });

    const formattedEvents = events.map(event => ({
      id: event.id,
      eventType: event.eventType,
      title: formatEventType(event.eventType),
      productName: event.product?.name || event.crop?.name || 'Produce Batch',
      farmName: event.product?.crop?.farm?.name || event.crop?.farm?.name || 'Farm',
      location: event.location || 'Unknown',
      timestamp: event.timestamp,
      verified: event.verified,
    }));

    res.json({
      success: true,
      data: formattedEvents,
    });
  } catch (error) {
    throw new AppError('Failed to fetch product events', 500);
  }
};

// Helper functions
function formatEventType(type: string): string {
  const formats: Record<string, string> = {
    PLANTED: '🌱 Planted',
    HARVESTED: '🌾 Harvested',
    PROCESSED: '⚙️ Processed',
    PACKAGED: '📦 Packaged',
    SHIPPED: '🚚 Shipped',
    RECEIVED: '✅ Received',
    QUALITY_CHECK: '✓ Quality Check',
    RETAIL: '🏪 Available for Purchase',
    SOLD: '💰 Sold',
  };
  return formats[type] || type;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
