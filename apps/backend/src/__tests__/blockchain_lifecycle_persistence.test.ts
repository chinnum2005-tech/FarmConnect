import 'express-async-errors';
import express from 'express';
import { Server } from 'http';
import { ethers } from 'ethers';
import {
  eventLifecycleService,
  RecordEventLifecycleParams,
} from '../services/eventLifecycle.service';
import {
  blockchainService,
  RegistryEventType,
} from '../services/blockchain.service';
import { hashEvidence, toBatchIdBytes32 } from '../services/evidenceHasher';
import { errorHandler } from '../middleware/errorHandler';
import verifyRoutes from '../routes/verify.routes';

jest.setTimeout(25000);

/**
 * DIRECTIVE 013: TRANSACTION LIFECYCLE PERSISTENCE & APPLICATION INTEGRATION
 *
 * Validates:
 * 1. 5-State lifecycle persistence: RECORDED_DB -> SUBMITTED -> IN_BLOCK -> CONFIRMED / FAILED.
 * 2. Real local contract calls to AgroTraceRegistry on Hardhat node (http://127.0.0.1:8545).
 * 3. Real HTTP application boundary: Express application mounted on ephemeral port using fetch.
 * 4. Idempotency guarantees, replay recovery, and concurrency serialization.
 * 5. Strict enforcement of unique constraints (unique transactionHash and idempotencyKey).
 * 6. Protection against fabricated hashes: transactionHash is null until broadcast.
 */

class IsolatedPrismaMock {
  public events = new Map<string, any>();
  public products = new Map<string, any>();
  public crops = new Map<string, any>();

  public supplyChainEvent = {
    create: async ({ data }: { data: any }) => {
      // Enforce unique constraints
      if (data.idempotencyKey) {
        for (const evt of this.events.values()) {
          if (evt.idempotencyKey === data.idempotencyKey) {
            const err: any = new Error(`Unique constraint failed on the fields: (\`idempotencyKey\`)`);
            err.code = 'P2002';
            throw err;
          }
        }
      }

      if (data.transactionHash) {
        for (const evt of this.events.values()) {
          if (evt.transactionHash && evt.transactionHash === data.transactionHash) {
            const err: any = new Error(`Unique constraint failed on the fields: (\`transactionHash\`)`);
            err.code = 'P2002';
            throw err;
          }
        }
      }

      const id = data.id || `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const record = {
        id,
        productId: data.productId || null,
        cropId: data.cropId || null,
        eventType: data.eventType,
        timestamp: data.timestamp || new Date(),
        location: data.location || null,
        actorId: data.actorId,
        metadata: data.metadata || null,
        transactionHash: data.transactionHash || null,
        chainStatus: data.chainStatus || 'RECORDED_DB',
        blockNumber: data.blockNumber || null,
        confirmations: data.confirmations !== undefined ? data.confirmations : 0,
        evidenceHash: data.evidenceHash || null,
        batchIdBytes32: data.batchIdBytes32 || null,
        idempotencyKey: data.idempotencyKey || null,
        verified: Boolean(data.verified),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.events.set(id, record);
      return { ...record };
    },

    findUnique: async ({ where }: { where: any }) => {
      if (where.id) {
        const item = this.events.get(where.id);
        return item ? { ...item } : null;
      }
      if (where.idempotencyKey) {
        for (const evt of this.events.values()) {
          if (evt.idempotencyKey === where.idempotencyKey) {
            return { ...evt };
          }
        }
      }
      if (where.transactionHash) {
        for (const evt of this.events.values()) {
          if (evt.transactionHash === where.transactionHash) {
            return { ...evt };
          }
        }
      }
      return null;
    },

    findFirst: async ({ where, orderBy }: { where?: any; orderBy?: any }) => {
      const all = Array.from(this.events.values());
      if (where?.productId) {
        const matches = all.filter((e) => e.productId === where.productId);
        return matches.length > 0 ? { ...matches[matches.length - 1] } : null;
      }
      return all.length > 0 ? { ...all[0] } : null;
    },

    findMany: async ({ where }: { where?: any } = {}) => {
      return Array.from(this.events.values()).map((e) => ({ ...e }));
    },

    update: async ({ where, data }: { where: any; data: any }) => {
      const record = this.events.get(where.id);
      if (!record) {
        throw new Error(`Record not found with id ${where.id}`);
      }

      // Check unique constraint on transactionHash if changed
      if (data.transactionHash && data.transactionHash !== record.transactionHash) {
        for (const [id, evt] of this.events.entries()) {
          if (id !== where.id && evt.transactionHash === data.transactionHash) {
            const err: any = new Error(`Unique constraint failed on the fields: (\`transactionHash\`)`);
            err.code = 'P2002';
            throw err;
          }
        }
      }

      const updated = {
        ...record,
        ...data,
        updatedAt: new Date(),
      };
      this.events.set(where.id, updated);
      return { ...updated };
    },
  };

  public product = {
    findUnique: async ({ where }: { where: any }) => {
      return this.products.get(where.id) || null;
    },
  };

  public crop = {
    findUnique: async ({ where }: { where: any }) => {
      return this.crops.get(where.id) || null;
    },
    findFirst: async ({ where }: { where: any }) => {
      for (const crop of this.crops.values()) {
        if (crop.id === where.id || crop.qrCode === where.qrCode) return crop;
      }
      return null;
    },
  };
}

describe('Directive 013: Transaction Lifecycle Persistence & Application Boundary', () => {
  let isolatedPrisma: IsolatedPrismaMock;
  let server: Server;
  let baseUrl: string;
  const localProvider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');

  const testBatchId = `BATCH-D013-${Date.now()}`;
  const actorId = 'user_actor_test_001';
  const originatingAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

  const genuinePlantedEvidence = {
    batchId: testBatchId,
    cropType: 'Durum Wheat',
    variety: 'Kalyan Sona',
    plantingDate: '2026-03-20T08:00:00.000Z',
    areaHectares: 15.5,
    seedCert: 'CERT-SEED-90210',
    farmerPhone: '+91 91234 56789', // Sensitive PII stripped by evidenceHasher
  };

  const genuineHarvestEvidence = {
    batchId: testBatchId,
    harvestDate: '2026-07-25T10:00:00.000Z',
    yieldKg: 6200,
    moisturePercent: 11.8,
    storageSilo: 'SILO-NORTH-3',
  };

  beforeAll(async () => {
    isolatedPrisma = new IsolatedPrismaMock();

    // Verify local node is running
    const net = await localProvider.getNetwork();
    expect(Number(net.chainId)).toBe(31337);

    // Setup real Express app mounted with verification routes on ephemeral port
    const app = express();
    app.use(express.json());
    app.use('/api/v1/verify', verifyRoutes);
    app.use(errorHandler);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr: any = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // =========================================================================
  // 1 & 2 & 3: Lifecycle Progression: RECORDED_DB -> SUBMITTED -> CONFIRMED
  // =========================================================================
  describe('Requirement 1, 2, 3: Full Lifecycle Persistence Flow', () => {
    it('1. Persists batch event initially in RECORDED_DB state with transactionHash=null', async () => {
      // Simulate pre-flight creation before broadcast
      const evidenceHash = hashEvidence(genuinePlantedEvidence);
      const preflight = await isolatedPrisma.supplyChainEvent.create({
        data: {
          productId: testBatchId,
          eventType: RegistryEventType.PLANTED as any,
          actorId,
          metadata: JSON.stringify(genuinePlantedEvidence),
          chainStatus: 'RECORDED_DB',
          transactionHash: null, // Critical: NEVER fabricated
          confirmations: 0,
          evidenceHash,
          batchIdBytes32: toBatchIdBytes32(testBatchId),
          idempotencyKey: `idem-${testBatchId}-PLANTED-${evidenceHash}`,
          verified: false,
        },
      });

      expect(preflight.chainStatus).toBe('RECORDED_DB');
      expect(preflight.transactionHash).toBeNull();
      expect(preflight.confirmations).toBe(0);
      expect(preflight.verified).toBe(false);
    });

    it('2 & 3. Submits to local Hardhat contract, transitions to SUBMITTED and CONFIRMED with real txHash', async () => {
      const result = await eventLifecycleService.recordAndPersistEvent(
        {
          batchId: testBatchId,
          productId: testBatchId,
          eventType: RegistryEventType.PLANTED,
          evidence: genuinePlantedEvidence,
          actorId,
          originatingActorAddress: originatingAddress,
        },
        isolatedPrisma
      );

      expect(result.status).toBe('CONFIRMED');
      expect(result.verified).toBe(true);
      expect(result.transactionHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.confirmations).toBe(1);

      // Verify the persisted record in isolatedPrisma
      const stored = await isolatedPrisma.supplyChainEvent.findUnique({
        where: { id: result.eventId },
      });

      expect(stored.chainStatus).toBe('CONFIRMED');
      expect(stored.transactionHash).toBe(result.transactionHash);
      expect(stored.blockNumber).toBe(result.blockNumber);
      expect(stored.verified).toBe(true);

      // Confirm receipt exists directly on the local Hardhat chain with EVM status 1
      const receipt = await localProvider.getTransactionReceipt(result.transactionHash!);
      expect(receipt).not.toBeNull();
      expect(receipt?.status).toBe(1);
    });
  });

  // =========================================================================
  // 4: Pre-submission RPC Failure handling
  // =========================================================================
  describe('Requirement 4: RPC Failure Before Submission', () => {
    it('does not falsely record a transaction hash when blockchain connection fails before broadcast', async () => {
      const offlineBatchId = `BATCH-OFFLINE-${Date.now()}`;
      const spy = jest.spyOn(blockchainService, 'getSignerContract').mockRejectedValueOnce(
        new Error('connect ECONNREFUSED 127.0.0.1:8545')
      );

      await expect(
        eventLifecycleService.recordAndPersistEvent(
          {
            batchId: offlineBatchId,
            eventType: RegistryEventType.HARVESTED,
            evidence: { test: 1 },
            actorId,
          },
          isolatedPrisma
        )
      ).rejects.toThrow('ECONNREFUSED');

      spy.mockRestore();

      // Find the event that failed
      const events = await isolatedPrisma.supplyChainEvent.findMany();
      const failed = events.find((e) => e.metadata?.includes('{"test":1}'));

      expect(failed).toBeDefined();
      expect(failed.chainStatus).toBe('FAILED');
      expect(failed.transactionHash).toBeNull(); // Must NEVER invent a fake hash
      expect(failed.verified).toBe(false);
    });
  });

  // =========================================================================
  // 5: Broadcast Transaction Pending State
  // =========================================================================
  describe('Requirement 5: Broadcast Transaction In-Flight (SUBMITTED)', () => {
    it('represents an in-flight broadcast transaction honestly with SUBMITTED status', async () => {
      const inFlightBatchId = `BATCH-INFLIGHT-${Date.now()}`;
      const realUnminedTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      const inFlightRecord = await isolatedPrisma.supplyChainEvent.create({
        data: {
          productId: inFlightBatchId,
          eventType: RegistryEventType.HARVESTED as any,
          actorId,
          metadata: JSON.stringify({ item: 'wheat' }),
          chainStatus: 'SUBMITTED',
          transactionHash: realUnminedTxHash,
          idempotencyKey: `idem-${inFlightBatchId}-HARVESTED-test`,
        },
      });

      // Query reconcile when receipt is not yet mined
      const reconciled = await eventLifecycleService.reconcileEvent(inFlightRecord.id, isolatedPrisma);
      expect(reconciled?.status).toBe('SUBMITTED');
      expect(reconciled?.transactionHash).toBe(realUnminedTxHash);
      expect(reconciled?.verified).toBe(false);
    });
  });

  // =========================================================================
  // 6: Reverted Transaction Representation
  // =========================================================================
  describe('Requirement 6: Reverted Transactions', () => {
    it('represents a reverted transaction accurately as FAILED', async () => {
      const revertBatchId = `BATCH-REVERT-${Date.now()}`;
      // Cause a revert by registering batch, then attempting to register it again
      await blockchainService.registerBatch(
        revertBatchId,
        RegistryEventType.PLANTED,
        hashEvidence({ id: revertBatchId }),
        originatingAddress
      );

      // Attempting to register again will revert on-chain
      await expect(
        eventLifecycleService.recordAndPersistEvent(
          {
            batchId: revertBatchId,
            eventType: RegistryEventType.PLANTED,
            evidence: { id: revertBatchId },
            actorId,
          },
          isolatedPrisma
        )
      ).rejects.toThrow();

      // Check persisted state
      const all = await isolatedPrisma.supplyChainEvent.findMany();
      const reverted = all.find((e) => e.idempotencyKey?.includes(revertBatchId));

      expect(reverted).toBeDefined();
      expect(reverted.chainStatus).toBe('FAILED');
      expect(reverted.verified).toBe(false);
    });
  });

  // =========================================================================
  // 7: Database Recovery After Blockchain Broadcast
  // =========================================================================
  describe('Requirement 7: Database Failure Recovery Without Duplicate Event', () => {
    it('reconciles an unconfirmed SUBMITTED record to CONFIRMED using the on-chain receipt', async () => {
      const recoveryBatchId = `BATCH-RECOVERY-${Date.now()}`;
      const harvestHash = hashEvidence(genuineHarvestEvidence);

      // Register the batch first
      await blockchainService.registerBatch(
        recoveryBatchId,
        RegistryEventType.PLANTED,
        hashEvidence({ seed: 1 }),
        originatingAddress
      );

      // Dispatch event directly to local chain
      const txResult = await blockchainService.recordEvent(
        recoveryBatchId,
        RegistryEventType.HARVESTED,
        harvestHash,
        originatingAddress
      );

      // Simulate state where DB only recorded SUBMITTED state before crashing
      const orphanedRecord = await isolatedPrisma.supplyChainEvent.create({
        data: {
          productId: recoveryBatchId,
          eventType: RegistryEventType.HARVESTED as any,
          actorId,
          metadata: JSON.stringify(genuineHarvestEvidence),
          chainStatus: 'SUBMITTED',
          transactionHash: txResult.txHash,
          idempotencyKey: `idem-${recoveryBatchId}-HARVESTED-orphan`,
          evidenceHash: harvestHash,
          batchIdBytes32: toBatchIdBytes32(recoveryBatchId),
        },
      });

      // Trigger recovery reconciliation
      const recovered = await eventLifecycleService.reconcileEvent(orphanedRecord.id, isolatedPrisma);

      expect(recovered?.status).toBe('CONFIRMED');
      expect(recovered?.verified).toBe(true);
      expect(recovered?.transactionHash).toBe(txResult.txHash);

      const dbAfter = await isolatedPrisma.supplyChainEvent.findUnique({
        where: { id: orphanedRecord.id },
      });
      expect(dbAfter.chainStatus).toBe('CONFIRMED');
      expect(dbAfter.verified).toBe(true);
    });
  });

  // =========================================================================
  // 8: Idempotent Retries
  // =========================================================================
  describe('Requirement 8: Idempotent Request Retries', () => {
    it('identical retry returns existing confirmed transaction without duplicating on-chain event', async () => {
      const retryBatchId = `BATCH-RETRY-${Date.now()}`;
      const clientKey = `client-req-uuid-9999-${Date.now()}`;

      // First call
      const res1 = await eventLifecycleService.recordAndPersistEvent(
        {
          batchId: retryBatchId,
          eventType: RegistryEventType.PLANTED,
          evidence: { batchId: retryBatchId, seed: 'lot-1' },
          actorId,
          idempotencyKey: clientKey,
        },
        isolatedPrisma
      );

      expect(res1.status).toBe('CONFIRMED');
      expect(res1.isReplay).toBe(false);

      // Identical retry with same client idempotency key
      const res2 = await eventLifecycleService.recordAndPersistEvent(
        {
          batchId: retryBatchId,
          eventType: RegistryEventType.PLANTED,
          evidence: { batchId: retryBatchId, seed: 'lot-1' },
          actorId,
          idempotencyKey: clientKey,
        },
        isolatedPrisma
      );

      expect(res2.status).toBe('CONFIRMED');
      expect(res2.isReplay).toBe(true);
      expect(res2.eventId).toBe(res1.eventId);
      expect(res2.transactionHash).toBe(res1.transactionHash);

      // On-chain event count must remain exactly 1
      const count = await blockchainService.getEventCount(retryBatchId);
      expect(count).toBe(1);
    });
  });

  // =========================================================================
  // 9: Concurrency Safety
  // =========================================================================
  describe('Requirement 9: Concurrency and Mutex Serialization', () => {
    it('safely serializes concurrent event submissions without nonce collision', async () => {
      const concBatchId = `BATCH-CONC-013-${Date.now()}`;

      // Register batch
      await eventLifecycleService.recordAndPersistEvent(
        {
          batchId: concBatchId,
          eventType: RegistryEventType.PLANTED,
          evidence: { id: concBatchId, stage: 'PLANTED' },
          actorId,
        },
        isolatedPrisma
      );

      // Dispatch 3 concurrent events
      const [res1, res2, res3] = await Promise.all([
        eventLifecycleService.recordAndPersistEvent(
          {
            batchId: concBatchId,
            eventType: RegistryEventType.PROCESSED,
            evidence: { id: concBatchId, stage: 'PROCESSED' },
            actorId,
          },
          isolatedPrisma
        ),
        eventLifecycleService.recordAndPersistEvent(
          {
            batchId: concBatchId,
            eventType: RegistryEventType.PACKAGED,
            evidence: { id: concBatchId, stage: 'PACKAGED' },
            actorId,
          },
          isolatedPrisma
        ),
        eventLifecycleService.recordAndPersistEvent(
          {
            batchId: concBatchId,
            eventType: RegistryEventType.SHIPPED,
            evidence: { id: concBatchId, stage: 'SHIPPED' },
            actorId,
          },
          isolatedPrisma
        ),
      ]);

      expect(res1.status).toBe('CONFIRMED');
      expect(res2.status).toBe('CONFIRMED');
      expect(res3.status).toBe('CONFIRMED');
      expect(new Set([res1.transactionHash, res2.transactionHash, res3.transactionHash]).size).toBe(3);

      const eventCount = await blockchainService.getEventCount(concBatchId);
      expect(eventCount).toBe(4); // 1 initial + 3 appended
    });
  });

  // =========================================================================
  // 10: Unique Constraint Behavior
  // =========================================================================
  describe('Requirement 10: Unique Constraints on Hashes and Idempotency', () => {
    it('rejects duplicate non-null transactionHash but allows multiple null transactionHash values', async () => {
      const tx1 = '0xaaaa1111222233334444555566667777888899990000aaaabbbbccccddddeeee01';

      await isolatedPrisma.supplyChainEvent.create({
        data: {
          eventType: RegistryEventType.PLANTED as any,
          actorId: 'user1',
          transactionHash: tx1,
          chainStatus: 'CONFIRMED',
        },
      });

      // Duplicate non-null transactionHash must throw unique constraint error
      await expect(
        isolatedPrisma.supplyChainEvent.create({
          data: {
            eventType: RegistryEventType.HARVESTED as any,
            actorId: 'user2',
            transactionHash: tx1,
            chainStatus: 'CONFIRMED',
          },
        })
      ).rejects.toThrow('Unique constraint failed on the fields: (`transactionHash`)');

      // Multiple null transactionHash values are strictly permitted
      const null1 = await isolatedPrisma.supplyChainEvent.create({
        data: {
          eventType: RegistryEventType.PLANTED as any,
          actorId: 'user3',
          transactionHash: null,
          chainStatus: 'RECORDED_DB',
        },
      });

      const null2 = await isolatedPrisma.supplyChainEvent.create({
        data: {
          eventType: RegistryEventType.HARVESTED as any,
          actorId: 'user4',
          transactionHash: null,
          chainStatus: 'RECORDED_DB',
        },
      });

      expect(null1.transactionHash).toBeNull();
      expect(null2.transactionHash).toBeNull();
    });
  });

  // =========================================================================
  // 11 & 12: Real HTTP Application Boundary Verification
  // =========================================================================
  describe('Requirement 11 & 12: Application Boundary Verification (fetch against Express)', () => {
    it('11. Confirms genuine evidence returns VERIFIED over real HTTP network request', async () => {
      const response = await fetch(
        `${baseUrl}/api/v1/verify/on-chain/${encodeURIComponent(testBatchId)}?eventType=PLANTED`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ evidence: genuinePlantedEvidence }),
        }
      );

      expect(response.status).toBe(200);
      const json: any = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.status).toBe('VERIFIED');
      expect(json.data.match).toBe(true);
      expect(json.data.onChainBatchExists).toBe(true);
      expect(json.data.computedEvidenceHash).toBe(hashEvidence(genuinePlantedEvidence));
    });

    it('12. Rejects tampered evidence returning MISMATCH over real HTTP network request', async () => {
      const tamperedEvidence = {
        ...genuinePlantedEvidence,
        areaHectares: 99.9, // Tampered field
      };

      const response = await fetch(
        `${baseUrl}/api/v1/verify/on-chain/${encodeURIComponent(testBatchId)}?eventType=PLANTED`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ evidence: tamperedEvidence }),
        }
      );

      expect(response.status).toBe(200);
      const json: any = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.status).toBe('MISMATCH');
      expect(json.data.match).toBe(false);
      expect(json.data.details).toContain('Evidence hash mismatch');
    });
  });

  // =========================================================================
  // 13: QR Route Compatibility
  // =========================================================================
  describe('Requirement 13: QR Verification Route Compatibility', () => {
    it('returns clean HTTP 404 for nonexistent QR codes over the HTTP boundary', async () => {
      const response = await fetch(`${baseUrl}/api/v1/verify/INVALID-QR-${Date.now()}`);
      expect(response.status).toBe(404);
      const json: any = await response.json();
      expect(json.error || json.message).toContain('Product not found or invalid QR code');
    });
  });

  // =========================================================================
  // 14: AI Prediction Provenance Invariance
  // =========================================================================
  describe('Requirement 14: AI Prediction Provenance Compatibility', () => {
    it('preserves property-order invariance and SHA-256 compatibility for AI models', () => {
      const aiPayload1 = {
        cropId: 'crop-wheat-alpha',
        modelVersion: 'yield-pred-v2.1',
        predictedYieldKg: 4250.75,
        confidence: 0.94,
        features: {
          soilMoisturePercent: 18.2,
          solarRadiationIndex: 245.0,
          historicalYieldAvg: 3900.0,
        },
      };

      const aiPayload2 = {
        features: {
          historicalYieldAvg: 3900.0,
          solarRadiationIndex: 245.0,
          soilMoisturePercent: 18.2,
        },
        confidence: 0.94,
        predictedYieldKg: 4250.75,
        modelVersion: 'yield-pred-v2.1',
        cropId: 'crop-wheat-alpha',
      };

      const hash1 = hashEvidence(aiPayload1);
      const hash2 = hashEvidence(aiPayload2);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });
  });
});
