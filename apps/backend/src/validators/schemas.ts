import { z } from 'zod';

// User schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  firstName: z.string().min(1, 'First name is required').optional().default('User'),
  lastName: z.string().min(1, 'Last name is required').optional().default('Member'),
  role: z.enum(['ADMIN', 'FARMER', 'DISTRIBUTOR', 'CONSUMER']).optional(),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Farm schemas
export const createFarmSchema = z.object({
  name: z.string().min(1, 'Farm name is required'),
  description: z.string().optional(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string(),
  }),
  size: z.number().positive('Size must be positive'),
  certification: z.string().optional(),
});

// Crop schemas
export const createCropSchema = z.object({
  name: z.string().min(1, 'Crop name is required'),
  type: z.enum(['WHEAT', 'RICE', 'CORN', 'SOYBEANS', 'BARLEY', 'OATS', 'CANOLA', 'SORGHUM', 'OTHER']),
  variety: z.string().optional(),
  plantingDate: z.string().transform((str) => new Date(str)),
  expectedHarvest: z.string().transform((str) => new Date(str)).optional(),
  area: z.number().positive('Area must be positive'),
});

export const updateCropStageSchema = z.object({
  growthStage: z.enum(['PLANTED', 'GERMINATION', 'VEGETATIVE', 'FLOWERING', 'FRUITING', 'MATURING', 'READY_FOR_HARVEST', 'HARVESTED']),
});

export const updateCropSchema = z.object({
  name: z.string().min(1, 'Crop name is required').optional(),
  type: z.enum(['WHEAT', 'RICE', 'CORN', 'SOYBEANS', 'BARLEY', 'OATS', 'CANOLA', 'SORGHUM', 'OTHER']).optional(),
  variety: z.string().optional(),
  plantingDate: z.string().transform((str) => new Date(str)).optional(),
  expectedHarvest: z.string().transform((str) => new Date(str)).optional(),
  area: z.number().positive('Area must be positive').optional(),
});

// Supply chain schemas
export const recordEventSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  eventType: z.enum(['PLANTED', 'HARVESTED', 'PROCESSED', 'PACKAGED', 'SHIPPED', 'RECEIVED', 'QUALITY_CHECK', 'RETAIL', 'SOLD']),
  timestamp: z.string().transform((str) => new Date(str)).optional(),
  location: z.string().optional(),
  metadata: z.string().optional(),
  transactionHash: z.string().optional(),
  blockNumber: z.number().optional(),
});

// Type exports
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateFarmInput = z.infer<typeof createFarmSchema>;
export type CreateCropInput = z.infer<typeof createCropSchema>;
export type UpdateCropStageInput = z.infer<typeof updateCropStageSchema>;
export type RecordEventInput = z.infer<typeof recordEventSchema>;
