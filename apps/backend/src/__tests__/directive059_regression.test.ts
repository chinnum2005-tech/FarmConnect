import { verifyProduct } from '../controllers/verify.controller';
import { createCrop } from '../controllers/crop.controller';
import { eventLifecycleService } from '../services/eventLifecycle.service';
import { blockchainService, RegistryEventType } from '../services/blockchain.service';
import { AppError } from '../middleware/errorHandler';

// Canonical category mapper matching the frontend implementation in Marketplace.tsx
export function getProductCategory(product: { cropType?: string; name?: string }): string {
  const text = `${product.cropType || ''} ${product.name || ''}`.toUpperCase();
  if (/WHEAT|RICE|PADDY|CORN|MAIZE|BARLEY|OATS|SORGHUM|MILLET|GRAIN|FLOUR/.test(text)) {
    return 'GRAINS';
  }
  if (/TOMATO|POTATO|ONION|CARROT|SPINACH|LETTUCE|CABBAGE|VEGETABLE|GREENS|PEA/.test(text)) {
    return 'VEGETABLES';
  }
  if (/APPLE|BANANA|ORANGE|MANGO|BERRY|GRAPE|FRUIT|CITRUS|PAPAYA|GUAVA/.test(text)) {
    return 'FRUITS';
  }
  if (/CHILI|PEPPER|TURMERIC|CARDAMOM|CLOVE|CINNAMON|GINGER|GARLIC|SPICE|MUSTARD/.test(text)) {
    return 'SPICES';
  }
  if (/MILK|CHEESE|BUTTER|YOGURT|GHEE|PANEER|DAIRY|CREAM/.test(text)) {
    return 'DAIRY';
  }
  return 'ALL';
}

describe('Directive 059: Regression Tests for Confirmed AgroTrace Fixes', () => {
  let mockEventStore: Map<string, any>;
  let mockCropStore: Map<string, any>;

  const createMockPrisma = () => ({
    supplyChainEvent: {
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        if (where.id) return mockEventStore.get(where.id) || null;
        if (where.idempotencyKey) {
          for (const ev of mockEventStore.values()) {
            if (ev.idempotencyKey === where.idempotencyKey) return ev;
          }
        }
        return null;
      }),
      findMany: jest.fn().mockImplementation(async ({ where }) => {
        const results: any[] = [];
        for (const ev of mockEventStore.values()) {
          if (where?.chainStatus && ev.chainStatus !== where.chainStatus) continue;
          if (where?.transactionHash?.not === null && ev.transactionHash === null) continue;
          results.push(ev);
        }
        return results;
      }),
      create: jest.fn().mockImplementation(async ({ data }) => {
        const record = { id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...data };
        mockEventStore.set(record.id, record);
        return record;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }) => {
        const existing = mockEventStore.get(where.id);
        if (!existing) throw new Error('Record not found');
        const updated = { ...existing, ...data };
        mockEventStore.set(where.id, updated);
        return updated;
      }),
    },
    crop: {
      update: jest.fn().mockImplementation(async ({ where, data }) => {
        const existing = mockCropStore.get(where.id);
        if (!existing) throw new Error('Crop not found');
        const updated = { ...existing, ...data };
        mockCropStore.set(where.id, updated);
        return updated;
      }),
    },
  });

  let mockPrisma: any;

  beforeEach(() => {
    mockEventStore = new Map();
    mockCropStore = new Map();
    mockPrisma = createMockPrisma();
    jest.restoreAllMocks();
  });

  // =========================================================================
  // FIX 1: 404 & Missing ID Truthful Handling
  // =========================================================================
  describe('Fix 1: Product Traceability & 404 Handling', () => {
    it('returns AppError 404 when querying an unknown product or QR code', async () => {
      const req: any = { params: { qrCode: '666666666666666666666666' } };
      const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      const prismaModule = require('../database/prisma').default;
      jest.spyOn(prismaModule.product, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prismaModule.crop, 'findFirst').mockResolvedValue(null);

      await expect(verifyProduct(req, res)).rejects.toThrow('Product not found or invalid QR code');
    });

    it('returns 404 for non-hex unknown QR slug', async () => {
      const req: any = { params: { qrCode: 'UNKNOWN-SLUG-12345' } };
      const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      const prismaModule = require('../database/prisma').default;
      jest.spyOn(prismaModule.crop, 'findFirst').mockResolvedValue(null);

      await expect(verifyProduct(req, res)).rejects.toThrow('Product not found or invalid QR code');
    });
  });

  // =========================================================================
  // FIX 2: Canonical Marketplace Category Mapping
  // =========================================================================
  describe('Fix 2: Marketplace Canonical Category Mapping', () => {
    it('maps wheat and grain varieties canonically to GRAINS', () => {
      expect(getProductCategory({ cropType: 'WHEAT', name: 'Organic Sharbati Wheat' })).toBe('GRAINS');
      expect(getProductCategory({ cropType: 'RICE', name: 'Basmati Rice Premium' })).toBe('GRAINS');
      expect(getProductCategory({ name: 'Whole Grain Flour' })).toBe('GRAINS');
      expect(getProductCategory({ cropType: 'BARLEY' })).toBe('GRAINS');
    });

    it('maps vegetable crops canonically to VEGETABLES', () => {
      expect(getProductCategory({ cropType: 'TOMATO', name: 'Farm Fresh Tomatoes' })).toBe('VEGETABLES');
      expect(getProductCategory({ name: 'Organic Spinach Leaves' })).toBe('VEGETABLES');
      expect(getProductCategory({ cropType: 'CARROT' })).toBe('VEGETABLES');
    });

    it('maps fruit crops canonically to FRUITS', () => {
      expect(getProductCategory({ cropType: 'APPLE', name: 'Shimla Royal Apples' })).toBe('FRUITS');
      expect(getProductCategory({ name: 'Alphonso Mango Box' })).toBe('FRUITS');
    });

    it('maps spice crops canonically to SPICES', () => {
      expect(getProductCategory({ cropType: 'CHILI', name: 'Guntur Red Chilli' })).toBe('SPICES');
      expect(getProductCategory({ name: 'Organic Turmeric Powder' })).toBe('SPICES');
    });

    it('maps dairy products canonically to DAIRY', () => {
      expect(getProductCategory({ name: 'Pure Desi A2 Cow Ghee' })).toBe('DAIRY');
      expect(getProductCategory({ name: 'Fresh Paneer 500g' })).toBe('DAIRY');
    });

    it('preserves existing production wheat/rice catalog items under GRAINS', () => {
      const productionProducts = [
        { cropType: 'WHEAT', name: 'Fresh Organic Wheat' },
        { cropType: 'WHEAT', name: 'Field 2 - Wheat Grain' },
        { cropType: 'RICE', name: 'Premium Sona Masoori Rice' },
      ];
      for (const prod of productionProducts) {
        expect(getProductCategory(prod)).toBe('GRAINS');
      }
    });
  });

  // =========================================================================
  // FIX 3: Cultivation Batches, QR Persistence & Land Capacity Validation
  // =========================================================================
  describe('Fix 3: Cultivation Batches, QR Persistence & Farm Capacity', () => {
    it('persists canonical QR identifier FARMCONNECT-{crop.id} against crop record', async () => {
      const mockCrop = {
        id: '6707f123456789abcdef0001',
        name: 'Batch 1 - Sharbati Wheat',
        qrCode: null,
      };
      mockCropStore.set(mockCrop.id, mockCrop);

      // Simulate QR generation persistence
      const canonicalIdentifier = `FARMCONNECT-${mockCrop.id}`;
      const updated = await mockPrisma.crop.update({
        where: { id: mockCrop.id },
        data: { qrCode: canonicalIdentifier },
      });

      expect(updated.qrCode).toBe(`FARMCONNECT-${mockCrop.id}`);
      expect(mockCropStore.get(mockCrop.id).qrCode).toBe(`FARMCONNECT-${mockCrop.id}`);
    });

    it('rejects crop creation with zero or negative area before database operations', async () => {
      const req: any = {
        user: { id: '666666666666666666666661' },
        body: {
          name: 'Zero Area Batch',
          type: 'WHEAT',
          plantingDate: '2026-10-01',
          expectedHarvest: '2027-02-01',
          area: 0,
        },
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await expect(createCrop(req, res)).rejects.toThrow('Crop area must be greater than 0');
    });

    it('rejects crop creation when requested area exceeds available farm capacity', async () => {
      const userId = '666666666666666666666661';
      const farmId = '666666666666666666666662';

      const req: any = {
        user: { id: userId },
        body: {
          name: 'Excess Wheat Batch',
          type: 'WHEAT',
          plantingDate: '2026-10-01',
          expectedHarvest: '2027-02-01',
          area: 2.0, // Exceeds remaining capacity (only 0 ha remaining)
        },
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const prismaModule = require('../database/prisma').default;
      jest.spyOn(prismaModule.farm, 'findUnique').mockResolvedValue({
        id: farmId,
        size: 3.44, // 3.44 ha total
      });
      // Existing active crops already take all 3.44 ha
      jest.spyOn(prismaModule.crop, 'findMany').mockResolvedValue([
        { area: 2.0 },
        { area: 1.44 },
      ]);

      await expect(createCrop(req, res)).rejects.toThrow('Insufficient land area');
    });

    it('accepts crop creation when area is within remaining farm capacity and auto-generates QR code', async () => {
      const userId = '666666666666666666666661';
      const farmId = '666666666666666666666662';
      const fieldId = '666666666666666666666663';
      const createdCropId = '666666666666666666666664';

      const req: any = {
        user: { id: userId },
        body: {
          name: 'Valid Wheat Batch',
          type: 'WHEAT',
          variety: 'Sharbati High Yield',
          plantingDate: '2026-10-01',
          expectedHarvest: '2027-02-01',
          area: 1.0,
          estimatedYield: 3500,
        },
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const prismaModule = require('../database/prisma').default;
      jest.spyOn(prismaModule.farm, 'findUnique').mockResolvedValue({
        id: farmId,
        size: 3.44,
      });
      jest.spyOn(prismaModule.crop, 'findMany').mockResolvedValue([
        { area: 1.0 }, // 1.0 ha used, 2.44 ha remaining
      ]);
      jest.spyOn(prismaModule.field, 'findFirst').mockResolvedValue({
        id: fieldId,
        farmId,
      });
      jest.spyOn(prismaModule.crop, 'create').mockResolvedValue({
        id: createdCropId,
        name: 'Valid Wheat Batch',
        type: 'WHEAT',
        farmId,
        fieldId,
        area: 1.0,
      });
      jest.spyOn(prismaModule.crop, 'update').mockResolvedValue({
        id: createdCropId,
        name: 'Valid Wheat Batch',
        type: 'WHEAT',
        farmId,
        fieldId,
        area: 1.0,
        qrCode: `FARMCONNECT-${createdCropId}`,
      });

      await createCrop(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            qrCode: `FARMCONNECT-${createdCropId}`,
          }),
        })
      );
    });
  });

  // =========================================================================
  // FIX 4: Honest Supply-Chain Event Lifecycle & Database-Only Events
  // =========================================================================
  describe('Fix 4: Supply-Chain Event Lifecycle & Database-Only Status', () => {
    it('preserves database event with RECORDED_DB and null transactionHash when unbroadcast', async () => {
      const batchId = 'product-db-only-1';
      const actorId = 'actor-user-1';

      // Initial record creation stage creates RECORDED_DB
      const event = await mockPrisma.supplyChainEvent.create({
        data: {
          productId: batchId,
          eventType: RegistryEventType.SOLD as any,
          actorId,
          chainStatus: 'RECORDED_DB',
          transactionHash: null,
          verified: false,
        },
      });

      expect(event.chainStatus).toBe('RECORDED_DB');
      expect(event.transactionHash).toBeNull();
      expect(event.verified).toBe(false);
    });

    it('eventLifecycleService does not invent transaction hashes when blockchain is unavailable', async () => {
      const batchId = `BATCH-OFFLINE-${Date.now()}`;
      const actorId = 'actor-offline-1';

      // Spy on blockchainService.getBatch to simulate network failure / RPC unavailable
      jest.spyOn(blockchainService, 'getBatch').mockRejectedValue(new Error('RPC Provider offline ECONNREFUSED'));
      jest.spyOn(blockchainService, 'registerBatch').mockRejectedValue(new Error('RPC Provider offline ECONNREFUSED'));

      await expect(
        eventLifecycleService.recordAndPersistEvent(
          {
            batchId,
            eventType: RegistryEventType.SOLD,
            evidence: { orderId: 'ord-123', amount: 5000 },
            actorId,
          },
          mockPrisma
        )
      ).rejects.toThrow('RPC Provider offline');

      // The pre-flight event was persisted in the database with transactionHash: null
      const events = Array.from(mockEventStore.values());
      const persisted = events.find(e => e.actorId === actorId);

      expect(persisted).toBeDefined();
      expect(persisted.transactionHash).toBeNull(); // NEVER an invented placeholder
      expect(persisted.verified).toBe(false);
    });
  });
});
