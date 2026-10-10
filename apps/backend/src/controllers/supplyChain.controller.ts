import { Response } from 'express';
import prisma from '../database/prisma';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { blockchainService } from '../services/blockchain.service';
import { eventLifecycleService } from '../services/eventLifecycle.service';

/**
 * Get supply chain events for a product
 */
export const getProductTraceability = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      throw new AppError('Product ID is required', 400);
    }

    const events = await prisma.supplyChainEvent.findMany({
      where: { productId },
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
 * Add a supply chain event
 */
export const addSupplyChainEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, eventType, location, description, metadata, latitude, longitude } = req.body;
    const userId = req.user!.id;

    if (!productId || !eventType) {
      throw new AppError('Product ID and event type are required', 400);
    }

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        crop: {
          include: { farm: true }
        }
      }
    });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    if (req.user!.role === 'FARMER' && product.crop.farm.userId !== userId) {
      throw new AppError('Unauthorized to add event to this product', 403);
    }

    // Create supply chain event with optional coordinates
    const metadataObj = metadata ? { ...metadata, latitude, longitude } : { description, latitude, longitude };

    // Record through honest 5-state lifecycle service
    const lifecycleResult = await eventLifecycleService.recordAndPersistEvent({
      batchId: productId,
      productId,
      eventType,
      evidence: metadataObj,
      actorId: userId,
      location: location || null,
      idempotencyKey: (req.headers && req.headers['idempotency-key'] ? String(req.headers['idempotency-key']) : undefined),
    });

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
      productName: event.product?.name || 'System Event',
      farmName: event.product?.crop?.farm?.name || 'System',
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

    // Find all products from this farmer's farms
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

    const productIds = farmerProducts.map(p => p.id);

    if (productIds.length === 0) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const events = await prisma.supplyChainEvent.findMany({
      where: {
        productId: { in: productIds }
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
        }
      },
      orderBy: { timestamp: 'desc' },
    });

    const formattedEvents = events.map(event => ({
      id: event.id,
      eventType: event.eventType,
      title: formatEventType(event.eventType),
      productName: event.product.name,
      farmName: event.product.crop.farm.name,
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
