import { Response } from 'express';
import prisma from '../database/prisma';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { blockchainService } from '../services/blockchain.service';
import { eventLifecycleService } from '../services/eventLifecycle.service';

/**
 * Get all shipments assigned to distributor
 */
export const getMyShipments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    if (req.user!.role !== 'DISTRIBUTOR' && req.user!.role !== 'ADMIN') {
      throw new AppError('Access restricted to distributors', 403);
    }

    const shipments = await prisma.shipment.findMany({
      where: { distributorId: userId },
      include: {
        order: {
          include: {
            items: {
              include: {
                product: {
                  include: {
                    crop: {
                      include: {
                        farm: true,
                      },
                    },
                  },
                },
              },
            },
            consumer: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedShipments = shipments.map(shipment => ({
      id: shipment.id,
      status: shipment.status,
      currentLocation: shipment.currentLocation,
      estimatedDelivery: shipment.estimatedDelivery,
      actualDelivery: shipment.actualDelivery,
      order: {
        id: shipment.order.id,
        totalPrice: shipment.order.totalPrice,
        shippingAddress: shipment.order.shippingAddress,
        consumerName: `${shipment.order.consumer.firstName} ${shipment.order.consumer.lastName}`,
        items: shipment.order.items.map(item => ({
          name: item.product?.name || 'Unknown Product',
          quantity: item.quantity,
          farmName: item.product?.crop?.farm?.name || 'Unknown Farm',
        })),
      },
    }));

    res.json({
      success: true,
      data: formattedShipments,
    });
  } catch (error) {
    throw new AppError('Failed to fetch shipments', 500);
  }
};

/**
 * Valid shipment state transitions
 */
const VALID_SHIPMENT_TRANSITIONS: Record<string, string[]> = {
  'PENDING_FARMER': ['ASSIGNED'], // Farmer prepares package and marks assigned to distributor pool
  'ASSIGNED': ['PICKED_UP'],       // Assigned distributor picks up from farm
  'PICKED_UP': ['IN_TRANSIT'],     // Assigned distributor starts transit
  'IN_TRANSIT': ['DELIVERED'],     // Assigned distributor delivers to consumer
  'DELIVERED': []                  // Terminal state
};

/**
 * Update shipment status
 */
export const updateShipmentStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { shipmentId, status, currentLocation, version } = req.body;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    if (!shipmentId || !status) {
      throw new AppError('Shipment ID and status are required', 400);
    }

    // P0 Gate 3: Consumers are never authorized to update shipment status
    if (userRole === 'CONSUMER') {
      throw new AppError('Consumers are not authorized to update shipment status', 403);
    }

    // Verify shipment existence
    const existingShipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        order: {
          include: {
            items: {
              include: {
                product: {
                  include: { crop: { include: { farm: true } } }
                }
              }
            }
          }
        }
      }
    });
    
    if (!existingShipment) {
      throw new AppError('Shipment not found', 404);
    }

    // Enforce valid state transitions
    const allowedNext = VALID_SHIPMENT_TRANSITIONS[existingShipment.status] || [];
    if (!allowedNext.includes(status)) {
      throw new AppError(`Invalid shipment status transition from '${existingShipment.status}' to '${status}'`, 400);
    }

    // Transition-specific role & ownership validation
    if (existingShipment.status === 'PENDING_FARMER' && status === 'ASSIGNED') {
      // Farmer must own crops in this order (or admin)
      if (userRole !== 'ADMIN') {
        const isFarmerProduct = existingShipment.order.items.some(
          item => item.product?.crop?.farm?.userId === userId
        );
        if (!isFarmerProduct) {
          throw new AppError('Unauthorized: Only the originating farmer can prepare and mark shipment as ASSIGNED', 403);
        }
      }
    } else if (['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(status)) {
      // Logistics updates require assigned distributor or admin
      if (userRole !== 'ADMIN') {
        if (userRole !== 'DISTRIBUTOR') {
          throw new AppError('Only distributors are authorized to perform logistics updates', 403);
        }
        if (!existingShipment.distributorId) {
          throw new AppError('Shipment must be claimed by a distributor before status can be updated', 400);
        }
        if (existingShipment.distributorId !== userId) {
          throw new AppError('Unauthorized: Shipment is assigned to another distributor', 403);
        }
      }
    }

    // Concurrency-safe atomic database update wrapped in transaction
    const shipment = await prisma.$transaction(async (tx) => {
      const wherePredicate: any = {
        id: shipmentId,
        status: existingShipment.status, // Enforce exact current state in DB predicate to prevent state skipping or overwriting
      };

      // Verify distributor ownership is enforced directly in the database update predicate
      if (userRole !== 'ADMIN' && ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(status)) {
        wherePredicate.distributorId = userId;
      }

      if (version !== undefined) {
        wherePredicate.version = version;
      }

      const updateResult = await tx.shipment.updateMany({
        where: wherePredicate,
        data: {
          status,
          currentLocation: currentLocation || null,
          actualDelivery: status === 'DELIVERED' ? new Date() : null,
          version: { increment: 1 }
        },
      });

      if (updateResult.count === 0) {
        throw new AppError('Conflict detected. Shipment state was modified or claimed by another transaction.', 409);
      }

      // Synchronize Order status atomically within the same database transaction
      if (status === 'PICKED_UP' || status === 'IN_TRANSIT') {
        await tx.order.update({
          where: { id: existingShipment.orderId },
          data: { status: 'IN_TRANSIT', version: { increment: 1 } },
        });
      } else if (status === 'DELIVERED') {
        await tx.order.update({
          where: { id: existingShipment.orderId },
          data: { status: 'DELIVERED', version: { increment: 1 } },
        });
      }

      return tx.shipment.findUnique({
        where: { id: shipmentId }
      });
    });

    if (!shipment) {
      throw new AppError('Shipment not found after update', 404);
    }

    if (status === 'DELIVERED') {
      // Record supply chain event via eventLifecycleService
      const order = await prisma.order.findUnique({
        where: { id: shipment.orderId },
        include: { items: true },
      });

      if (order) {
        for (const item of order.items) {
          const metadata = {
            orderId: order.id,
            deliveredAt: new Date().toISOString(),
          };

          // Route delivery event through eventLifecycleService asynchronously
          eventLifecycleService.recordAndPersistEvent({
            batchId: item.productId,
            productId: item.productId,
            eventType: 'RECEIVED',
            evidence: metadata,
            actorId: req.user!.id,
            location: currentLocation || order.shippingAddress,
            idempotencyKey: `idem-shipment-${shipment.id}-${item.productId}-DELIVERED`,
          }).catch((err) => {
            // If blockchain submission is unavailable, eventLifecycleService preserves
            // the database event record without inventing a transaction hash or confirmation.
            console.warn(`[Shipment] Blockchain anchoring unavailable for delivered product ${item.productId}:`, err);
          });
        }
      }
    }

    res.json({
      success: true,
      message: 'Shipment status updated successfully',
      data: shipment,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to update shipment status', 500);
  }
};

/**
 * Get all available shipments (for distributors to claim)
 */
export const getAvailableShipments = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'DISTRIBUTOR' && req.user!.role !== 'ADMIN') {
      throw new AppError('Access restricted to distributors', 403);
    }
    const shipments = await prisma.shipment.findMany({
      where: {
        status: 'ASSIGNED',
        OR: [
          { distributorId: null },
          { distributorId: { isSet: false } }
        ]
      },
      include: {
        order: {
          include: {
            items: {
              include: {
                product: {
                  include: {
                    crop: {
                      include: {
                        farm: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedShipments = shipments.map(shipment => ({
      id: shipment.id,
      pickupLocation: shipment.order.shippingAddress.split('to')[0]?.trim() || 'Unknown',
      deliveryLocation: shipment.order.shippingAddress,
      estimatedDelivery: shipment.estimatedDelivery,
      order: {
        id: shipment.order.id,
        totalPrice: shipment.order.totalPrice,
        items: shipment.order.items.map(item => ({
          name: item.product.name,
          quantity: item.quantity,
          farmName: item.product.crop.farm.name,
        })),
      },
    }));

    res.json({
      success: true,
      data: formattedShipments,
    });
  } catch (error) {
    throw new AppError('Failed to fetch available shipments', 500);
  }
};

/**
 * Claim a shipment (assign to current distributor)
 */
export const claimShipment = async (req: AuthRequest, res: Response) => {
  try {
    const { shipmentId } = req.body;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    if (!shipmentId) {
      throw new AppError('Shipment ID is required', 400);
    }

    // P0 Gate 3: Require distributor role
    if (userRole !== 'DISTRIBUTOR') {
      throw new AppError('Only distributors are authorized to claim shipments', 403);
    }

    // P0 Gate 3: Concurrency-safe atomic claim
    const updateResult = await prisma.shipment.updateMany({
      where: {
        id: shipmentId,
        status: 'ASSIGNED',
        OR: [
          { distributorId: null },
          { distributorId: { isSet: false } }
        ]
      },
      data: {
        distributorId: userId,
        version: { increment: 1 }
      }
    });

    if (updateResult.count === 0) {
      const existingShipment = await prisma.shipment.findUnique({
        where: { id: shipmentId }
      });

      if (!existingShipment) {
        throw new AppError('Shipment not found', 404);
      }
      if (existingShipment.distributorId) {
        throw new AppError('Shipment is already claimed by another distributor', 409);
      }
      if (existingShipment.status !== 'ASSIGNED') {
        throw new AppError(`Shipment is in status '${existingShipment.status}' and cannot be claimed (must be ASSIGNED)`, 400);
      }
      throw new AppError('Unable to claim shipment', 400);
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId }
    });

    res.json({
      success: true,
      message: 'Shipment claimed successfully',
      data: shipment,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to claim shipment', 500);
  }
};
