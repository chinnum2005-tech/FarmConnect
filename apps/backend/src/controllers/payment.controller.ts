import { Request, Response } from 'express';
import Stripe from 'stripe';
import prisma from '../database/prisma';
import { blockchainService } from '../services/blockchain.service';
import { eventLifecycleService } from '../services/eventLifecycle.service';

let stripe: Stripe | undefined;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16' as any,
  });
}

export const handleStripeWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    console.error('Payment gateway (Stripe) is not configured. Webhooks are disabled.');
    return res.status(503).json({ error: 'Payment service unavailable: Stripe is not configured' });
  }

  if (!sig) {
    return res.status(400).send('Webhook Error: Missing stripe-signature header');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig!, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // 1. Check Idempotency - concurrency-safe insertion
    try {
      await prisma.stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          type: event.type,
        }
      });
    } catch (e: any) {
      if (e.code === 'P2002') { // Unique constraint violation
        const existingEvent = await prisma.stripeWebhookEvent.findUnique({ where: { eventId: event.id } });
        if (existingEvent?.processedAt) {
          console.log(`Webhook ${event.id} already processed`);
          return res.json({ received: true });
        }
        // If processedAt is null, a previous attempt crashed or is still running.
        // We can safely proceed because the DB transaction locks the order status.
        console.log(`Webhook ${event.id} retrying...`);
      } else {
        throw e;
      }
    }

    // 2. Process the event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      const userId = session.metadata?.userId;

      if (orderId) {
        await processSuccessfulPayment(orderId, session, userId!);
      }
    }

    // 3. Mark as completely processed
    await prisma.stripeWebhookEvent.update({
      where: { eventId: event.id },
      data: { processedAt: new Date() }
    });

    res.json({ received: true });
  } catch (err: any) {
    console.error('Webhook processing failed:', err);
    return res.status(500).send(`Webhook Handler Error: ${err.message}`);
  }
};

async function processSuccessfulPayment(orderId: string, session: Stripe.Checkout.Session, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } } }
  });

  if (!order) {
    console.error(`Order ${orderId} not found`);
    return;
  }

  if (order.paymentStatus !== 'UNPAID') {
    console.log(`Order ${orderId} already processed (Status: ${order.paymentStatus})`);
    return;
  }

  // Verify amount matches backend total
  const stripeAmount = session.amount_total; // in cents
  const orderAmountCents = Math.round(order.totalPrice * 100);

  if (stripeAmount !== orderAmountCents || session.currency?.toLowerCase() !== 'inr') {
    console.error(`CRITICAL: Payment mismatch for order ${orderId}. Stripe: ${stripeAmount}, Order: ${orderAmountCents}`);
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'REFUND_REQUIRED',
        status: 'FAILED',
        paymentIntentId: session.payment_intent as string
      }
    });
    return;
  }

  // Atomically decrement stock in a Prisma MongoDB transaction
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Atomic database-level conditional transition: PENDING + UNPAID -> PAID
      // Prevents concurrent webhook replays or cancelled orders from duplicating inventory deductions or shipment creation
      const orderClaim = await tx.order.updateMany({
        where: {
          id: orderId,
          status: 'PENDING',
          paymentStatus: 'UNPAID', // Enforce state transition guard directly in database predicate
        },
        data: {
          paymentStatus: 'PAID',
          status: 'PAID',
          paymentIntentId: session.payment_intent as string,
          version: { increment: 1 },
        },
      });

      if (orderClaim.count === 0) {
        // Inspect if order was cancelled concurrently
        const currentOrder = await tx.order.findUnique({ where: { id: orderId } });
        if (currentOrder && (currentOrder.status === 'CANCELLED' || currentOrder.paymentStatus === 'CANCELLED')) {
          // Customer card was charged via Stripe, but order was cancelled concurrently before webhook processed.
          // Flag REFUND_REQUIRED without decrementing inventory or creating shipment!
          await tx.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: 'REFUND_REQUIRED',
              paymentIntentId: session.payment_intent as string,
              version: { increment: 1 },
            },
          });
          console.warn(`CRITICAL: Order ${orderId} was cancelled before payment confirmed. Marked REFUND_REQUIRED without fulfilling.`);
          return;
        }
        throw new Error('Order is no longer UNPAID');
      }

      // 2. Safely decrement inventory using updateMany for atomic condition checks
      for (const item of order.items) {
        const updated = await tx.product.updateMany({
          where: { 
            id: item.productId,
            quantity: { gte: item.quantity } // Must have at least the requested quantity
          },
          data: {
            quantity: { decrement: item.quantity }
          }
        });

        if (updated.count === 0) {
          throw new Error('INSUFFICIENT_STOCK');
        }
      }

      // 3. Create single shipment record (relies on Shipment @unique(orderId) schema constraint)
      const existingShipment = await tx.shipment.findUnique({ where: { orderId } });
      if (!existingShipment) {
        await tx.shipment.create({
          data: {
            orderId: order.id,
            status: 'PENDING_FARMER',
          },
        });
      }
    });
  } catch (error: any) {
    if (error.message === 'INSUFFICIENT_STOCK') {
      // Rollback occurred. Set REFUND_REQUIRED outside the transaction
      await prisma.order.update({
        where: { id: orderId },
        data: { 
          paymentStatus: 'REFUND_REQUIRED',
          status: 'FAILED',
          paymentIntentId: session.payment_intent as string
        }
      });
      console.error(`CRITICAL: Order ${orderId} paid but insufficient stock. Rolled back. Requires manual refund.`);
      return; // Stop here, payment considered failed from fulfillment perspective
    } else if (error.message === 'Order is no longer UNPAID') {
      console.log(`Order ${orderId} was processed concurrently.`);
      return;
    } else {
      console.error(`Transaction failed for order ${orderId}:`, error);
      throw error; // Rethrow to trigger Stripe retry!
    }
  }

  // Record supply chain events via eventLifecycleService asynchronously (non-blocking)
  setImmediate(() => {
    (async () => {
      for (const item of order.items) {
        try {
          const metadata = {
            orderId: order.id,
            quantity: item.quantity,
            amount: item.price * item.quantity,
          };

          await eventLifecycleService.recordAndPersistEvent({
            batchId: item.productId,
            productId: item.productId,
            eventType: 'SOLD',
            evidence: metadata,
            actorId: userId,
            location: order.shippingAddress,
            idempotencyKey: `idem-payment-${order.id}-${item.productId}`,
          });
        } catch (lifecycleErr) {
          // If blockchain submission is unavailable, eventLifecycleService preserves
          // the database event record without inventing a transaction hash or confirmation.
          console.warn(`[Payment] Blockchain anchoring unavailable for product ${item.productId}:`, lifecycleErr);
        }
      }
    })();
  });
}
