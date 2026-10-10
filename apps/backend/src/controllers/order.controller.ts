import { Response } from 'express';
import prisma from '../database/prisma';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { blockchainService } from '../services/blockchain.service';

import Stripe from 'stripe';

let stripe: Stripe | undefined;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16' as any,
  });
}

/**
 * Create order from cart
 */
export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { shippingAddress, productId, quantity, items } = req.body;

    if (!shippingAddress) {
      throw new AppError('Shipping address is required', 400);
    }

    let itemsToProcess: any[] = [];

    if (productId && quantity) {
      // Direct buy flow
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) throw new AppError('Product not found', 404);
      if (product.quantity < quantity) throw new AppError(`Insufficient stock. Only ${product.quantity}kg available.`, 400);
      
      itemsToProcess = [{
        productId: product.id,
        quantity: quantity,
        product: product
      }];
    } else if (items && Array.isArray(items) && items.length > 0) {
      // Cart flow from frontend
      for (const item of items) {
        const product = await prisma.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new AppError(`Product ${item.productId} not found`, 404);
        if (product.quantity < item.quantity) {
          throw new AppError(`Insufficient stock for ${product.name}. Only ${product.quantity}kg available.`, 400);
        }
        itemsToProcess.push({
          productId: product.id,
          quantity: item.quantity,
          product: product
        });
      }
    } else {
      throw new AppError('No items to process', 400);
    }

    // Calculate total price securely
    let totalPrice = 0;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const item of itemsToProcess) {
      // Base price + 5% distributor commission
      const itemPrice = parseFloat((item.product.price * 1.05).toFixed(2));
      totalPrice += itemPrice * item.quantity;

      lineItems.push({
        price_data: {
          currency: 'inr',
          product_data: {
            name: item.product.name,
            metadata: {
              productId: item.productId
            }
          },
          unit_amount: Math.round(itemPrice * 100), // Stripe expects amounts in cents/paise
        },
        quantity: item.quantity,
      });
    }

    // Create order, but DO NOT decrease stock yet.
    const order = await prisma.$transaction(async (tx) => {
      // Create the order
      const newOrder = await tx.order.create({
        data: {
          consumerId: userId,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          totalPrice,
          shippingAddress,
          items: {
            create: itemsToProcess.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              price: parseFloat((item.product.price * 1.05).toFixed(2)),
            })),
          },
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  crop: {
                    include: {
                      farm: {
                        include: { user: { select: { firstName: true, lastName: true } } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      return newOrder;
    });

    // Create Stripe Checkout session
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    // We only create real sessions if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY || !stripe) {
      throw new AppError('Payment gateway (Stripe) is not configured on the server.', 503);
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${frontendUrl}/orders?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/marketplace`,
      client_reference_id: order.id,
      metadata: {
        orderId: order.id,
        userId: userId,
      }
    });

    // Update order with session ID
    await prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: session.id }
    });

    res.status(201).json({
      success: true,
      message: 'Order created, redirecting to payment',
      data: {
        ...order,
        checkoutUrl: session.url
      },
    });
  } catch (error: any) {
    console.error('Order creation error:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to create order: ' + error.message, 500);
  }
};

/**
 * Get consumer's orders
 */
export const getMyOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const orders = await prisma.order.findMany({
      where: { consumerId: userId },
      include: {
        items: {
          include: {
            product: {
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
              }
            }
          }
        },
        shipment: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedOrders = orders.map(order => ({
      id: order.id,
      status: order.status,
      totalPrice: order.totalPrice,
      shippingAddress: order.shippingAddress,
      createdAt: order.createdAt,
      items: order.items.map(item => ({
        productId: item.productId,
        name: item.product?.name || 'Unknown Product',
        quantity: item.quantity,
        price: item.price,
        farmName: item.product?.crop?.farm?.user ? `${item.product.crop.farm.user.firstName} ${item.product.crop.farm.user.lastName}'s Farm` : 'Unknown Farm',
        image: getEmojiForCrop(item.product?.crop?.type || 'OTHER'),
      })),
      shipment: order.shipment ? {
        status: order.shipment.status,
        currentLocation: order.shipment.currentLocation,
        estimatedDelivery: order.shipment.estimatedDelivery,
      } : null,
    }));

    res.json({
      success: true,
      data: formattedOrders,
    });
  } catch (error) {
    throw new AppError('Failed to fetch orders', 500);
  }
};

/**
 * Get farmer's orders (orders containing their products)
 */
export const getFarmerOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Find all products belonging to this farmer
    const farmerProducts = await prisma.product.findMany({
      where: {
        crop: {
          farm: {
            userId,
          },
        },
      },
      select: { id: true },
    });

    const productIds = farmerProducts.map(p => p.id);

    if (productIds.length === 0) {
      return res.json({
        success: true,
        data: [],
      });
    }

    // Get all orders containing these products
    const orders = await prisma.order.findMany({
      where: {
        items: {
          some: {
            productId: { in: productIds },
          },
        },
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                crop: true,
              }
            }
          }
        },
        consumer: {
          select: {
            firstName: true,
            lastName: true,
          }
        },
        shipment: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedOrders = orders.map(order => ({
      id: order.id,
      status: order.status,
      totalPrice: order.totalPrice,
      createdAt: order.createdAt,
      consumerName: `${order.consumer.firstName} ${order.consumer.lastName}`,
      items: order.items
        .filter(item => productIds.includes(item.productId))
        .map(item => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.price,
        })),
      shipment: order.shipment ? {
        id: order.shipment.id,
        status: order.shipment.status,
        currentLocation: order.shipment.currentLocation,
      } : null,
    }));

    res.json({
      success: true,
      data: formattedOrders,
    });
  } catch (error) {
    throw new AppError('Failed to fetch farmer orders', 500);
  }
};

/**
 * Explicit state transition policy for orders
 */
const VALID_ORDER_TRANSITIONS: Record<string, string[]> = {
  'PENDING': ['CANCELLED'],           // 'PAID' can only be set via payment webhook
  'PAID': ['PROCESSING', 'CANCELLED'],
  'PROCESSING': ['IN_TRANSIT', 'CANCELLED'],
  'IN_TRANSIT': ['DELIVERED'],
  'DELIVERED': [],
  'CANCELLED': [],
  'FAILED': []
};

/**
 * Get order by ID (with strict role-based ownership authorization)
 */
export const getOrderById = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    if (!orderId) {
      throw new AppError('Order ID is required', 400);
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              include: {
                crop: {
                  include: {
                    farm: {
                      include: {
                        user: { select: { firstName: true, lastName: true, id: true } }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        shipment: true,
        consumer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        }
      }
    });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    // Role-based access control
    let isAuthorized = false;
    if (userRole === 'ADMIN') {
      isAuthorized = true;
    } else if (userRole === 'CONSUMER' && order.consumerId === userId) {
      isAuthorized = true;
    } else if (userRole === 'FARMER') {
      const hasFarmerProduct = order.items.some(
        item => item.product.crop.farm.userId === userId
      );
      if (hasFarmerProduct) {
        isAuthorized = true;
      }
    } else if (userRole === 'DISTRIBUTOR') {
      if (order.shipment && order.shipment.distributorId === userId) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new AppError('Unauthorized to view this order', 403);
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch order', 500);
  }
};

/**
 * Update order status
 */
export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  try {
    const orderId = req.params.orderId || req.body.orderId;
    const { status, version } = req.body;

    if (!orderId || !status) {
      throw new AppError('Order ID and status are required', 400);
    }

    // P0 Security: Never permit manual transition to PAID or DELIVERED via this endpoint
    if (status === 'PAID') {
      throw new AppError('Order payment status cannot be set manually. It is verified strictly via payment gateway webhooks.', 403);
    }
    if (status === 'DELIVERED') {
      throw new AppError('Order delivery status cannot be updated via this endpoint. Deliveries are confirmed via distributor shipment updates.', 403);
    }

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!existingOrder) {
      throw new AppError('Order not found', 404);
    }

    // Role-based state-transition policy
    const userRole = req.user!.role;
    const userId = req.user!.id;

    if (userRole === 'CONSUMER') {
      if (existingOrder.consumerId !== userId) {
        throw new AppError('Unauthorized to access or modify this order', 403);
      }
      if (status !== 'CANCELLED') {
        throw new AppError('Consumers are only permitted to cancel pending orders', 403);
      }
      if (existingOrder.status !== 'PENDING') {
        throw new AppError('Cannot cancel an order that has already been paid or processed', 400);
      }
    } else if (userRole === 'FARMER') {
      const orderWithItems = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: { include: { crop: { include: { farm: true } } } } } } }
      });
      const hasFarmerProduct = orderWithItems?.items.some(
        item => item.product.crop.farm.userId === userId
      );
      if (!hasFarmerProduct) {
        throw new AppError('Unauthorized to modify this order: does not contain your farm products', 403);
      }
      if (existingOrder.status === 'PENDING') {
        throw new AppError('Cannot process an unpaid order. Payment must be confirmed first.', 400);
      }
      if (!['PROCESSING', 'CANCELLED'].includes(status)) {
        throw new AppError('Farmers are only permitted to transition orders to PROCESSING or CANCELLED', 403);
      }
    } else if (userRole === 'DISTRIBUTOR') {
      throw new AppError('Distributors must update logistics status via the shipment tracking endpoint', 403);
    } else if (userRole !== 'ADMIN') {
      throw new AppError('Unauthorized role for updating order status', 403);
    }

    // Validate against explicit transition policy
    const allowedTransitions = VALID_ORDER_TRANSITIONS[existingOrder.status] || [];
    if (!allowedTransitions.includes(status)) {
      throw new AppError(`Invalid order status transition from '${existingOrder.status}' to '${status}'`, 400);
    }

    // Concurrency-safe atomic database update wrapped in transaction
    const order = await prisma.$transaction(async (tx) => {
      const updatePredicate: any = {
        id: orderId,
        status: existingOrder.status, // Enforces exact current state in DB predicate to prevent state skipping or overwriting
      };
      if (version !== undefined) {
        updatePredicate.version = version;
      }

      const updateData: any = { 
        status,
        version: { increment: 1 } 
      };

      // Set payment status safely upon cancellation to maintain consistency with payments
      if (status === 'CANCELLED') {
        if (existingOrder.paymentStatus === 'PAID') {
          updateData.paymentStatus = 'REFUND_REQUIRED';
        } else if (existingOrder.paymentStatus === 'UNPAID') {
          updateData.paymentStatus = 'CANCELLED';
        }
      }

      const updateResult = await tx.order.updateMany({
        where: updatePredicate,
        data: updateData,
      });

      if (updateResult.count === 0) {
        throw new AppError('Conflict detected. Order has been modified by another concurrent transaction. Please refresh and try again.', 409);
      }

      // If an already-PAID order is cancelled (e.g. by farmer), restore deducted inventory
      if (status === 'CANCELLED' && existingOrder.paymentStatus === 'PAID' && existingOrder.items?.length) {
        for (const item of existingOrder.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { quantity: { increment: item.quantity } }
          });
        }
      }

      // Synchronize shipment status safely within the same database transaction
      if (status === 'CANCELLED') {
        await tx.shipment.updateMany({
          where: { orderId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
          data: { status: 'CANCELLED', version: { increment: 1 } }
        });
      }

      return tx.order.findUnique({
        where: { id: orderId }
      });
    });

    res.json({
      success: true,
      message: 'Order status updated',
      data: order,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to update order status', 500);
  }
};

// Helper function to get emoji for crop type
function getEmojiForCrop(cropType: string): string {
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
