import { Router } from 'express';
import express from 'express';
import { handleStripeWebhook } from '../controllers/payment.controller';

const router = Router();

// Stripe needs the raw body to verify the signature
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

export default router;
