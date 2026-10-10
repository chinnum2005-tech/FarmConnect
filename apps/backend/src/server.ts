import 'dotenv/config';
import express, { Application } from 'express';
import 'express-async-errors';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { requestId } from './middleware/requestId';
import { securityMiddleware, rlsMiddleware } from './middleware/security';

// Import routes
import authRoutes from './routes/auth.routes';
import farmRoutes from './routes/farm.routes';
import cropRoutes from './routes/crop.routes';
import verifyRoutes from './routes/verify.routes';
import qrRoutes from './routes/qrRoutes';
import productRoutes from './routes/product.routes';
import orderRoutes from './routes/order.routes';
import cartRoutes from './routes/cart.routes';
import shipmentRoutes from './routes/shipment.routes';
import supplyChainRoutes from './routes/supplyChain.routes';
import chatRoutes from './routes/chat.routes';
import predictionRoutes from './routes/prediction.routes';
import fieldRoutes from './routes/field.routes';
import ndviRoutes from './routes/ndvi.routes';
import weatherRoutes from './routes/weather.routes';
import recommendationRoutes from './routes/recommendation.routes';
import adminRoutes from './routes/admin.routes';
import marketRoutes from './routes/market.routes';
import { startProvenanceListener } from './services/provenanceListener';
import { startPriceSnapshotJob } from './jobs/priceSnapshot.job';

// Error handling middleware
import { errorHandler } from './middleware/errorHandler';


// Validate core required environment variables before starting
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ CRITICAL: Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Payment configuration validation
if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
  console.warn('⚠️  WARNING: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is not configured. Payment endpoints and webhooks are disabled and will return 503 Service Unavailable.');
}

const app: Application = express();
const PORT = process.env.PORT || 3001;

// Trust reverse proxy (Render load balancer)
app.set('trust proxy', 1);

// CORS configuration (MUST be first before other middleware)
const configuredOrigins = [
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
  'https://agrotrace-web.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
].filter(Boolean) as string[];

// Normalize origins: strip trailing slashes and deduplicate
const allowedOrigins = Array.from(new Set(configuredOrigins.map((o) => o.replace(/\/+$/, ''))));

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/+$/, '');
    if (
      allowedOrigins.includes(normalizedOrigin) ||
      (process.env.NODE_ENV === 'development' && (normalizedOrigin.startsWith('http://localhost:') || normalizedOrigin.startsWith('http://127.0.0.1:'))) ||
      /^https:\/\/agrotrace-web(-[a-z0-9-]+)?\.onrender\.com$/.test(normalizedOrigin)
    ) {
      return callback(null, true);
    }
    // Return false without throwing an unhandled Error that causes 500 responses
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-request-id', 'Accept', 'Origin'],
  exposedHeaders: ['x-request-id', 'Set-Cookie'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Request tracking
app.use(requestId);

import paymentRoutes from './routes/payment.routes';

// Security headers
app.use(securityMiddleware);

// Cookie parsing
app.use(cookieParser());

// MUST be before express.json() for Stripe webhook raw body verification
app.use('/api/v1/payments', paymentRoutes);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// RLS enforcement context
app.use(rlsMiddleware);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 5000 : 1000, // Generous limit for demo & dashboard polling
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
});

app.use('/api/', limiter);

// Prevent caching of sensitive API responses
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'FarmConnect AI Backend',
  });
});

// Welcome / root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to AgroTrace AI Backend API',
    status: 'OK',
    health: '/health',
    docs: '/api-docs'
  });
});

// API Routes (MED-006)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/farms', farmRoutes);
app.use('/api/v1/crops', cropRoutes);
app.use('/api/v1/fields', fieldRoutes);
app.use('/predict', predictionRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/shipments', shipmentRoutes);
app.use('/api/v1/supply-chain', supplyChainRoutes);
app.use('/api/v1/verify', verifyRoutes);
app.use('/api/v1/qr', qrRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/predict', predictionRoutes);
app.use('/api/v1/ndvi', ndviRoutes);
app.use('/api/v1/weather', weatherRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/recommendations', recommendationRoutes);
app.use('/api/v1/market', marketRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 FarmConnect AI Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
  
  // Start blockchain event listener
  startProvenanceListener();
  
  // Start daily market price snapshot job
  startPriceSnapshotJob();
});

export default app;
