import { eventLifecycleService } from '../services/eventLifecycle.service';
import { blockchainService, RegistryEventType } from '../services/blockchain.service';

describe('Directive 044: Transaction Lifecycle Recovery & Post-Restart Reconciliation Tests', () => {
  // In-memory mock database store for supplyChainEvents
  let mockEventStore: Map<string, any>;

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
  });

  let mockPrisma: any;

  beforeEach(() => {
    mockEventStore = new Map();
    mockPrisma = createMockPrisma();
    jest.restoreAllMocks();
  });

  describe('1. Post-Restart Reconciliation of In-Flight (SUBMITTED) Transactions', () => {
    it('reconciles an in-flight SUBMITTED transaction to CONFIRMED when receipt is mined', async () => {
      const pendingRecord = {
        id: 'evt-submitted-1',
        chainStatus: 'SUBMITTED',
        transactionHash: '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        blockNumber: null,
        confirmations: 0,
        evidenceHash: '0xabc123',
        batchIdBytes32: '0xbatch1',
        idempotencyKey: 'idem-1',
        verified: false,
      };
      mockEventStore.set(pendingRecord.id, pendingRecord);

      // Mock blockchain receipt: successfully mined at block 500
      jest.spyOn(blockchainService, 'getTransactionReceipt').mockResolvedValue({
        status: 1, // 1 = EVM Success
        blockNumber: 500,
        hash: pendingRecord.transactionHash,
      } as any);

      const reconciled = await eventLifecycleService.reconcileEvent(pendingRecord.id, mockPrisma);

      expect(reconciled).not.toBeNull();
      expect(reconciled?.status).toBe('CONFIRMED');
      expect(reconciled?.blockNumber).toBe(500);
      expect(reconciled?.verified).toBe(true);
      expect(reconciled?.transactionHash).toBe(pendingRecord.transactionHash);

      const inDb = mockEventStore.get(pendingRecord.id);
      expect(inDb.chainStatus).toBe('CONFIRMED');
      expect(inDb.blockNumber).toBe(500);
      expect(inDb.verified).toBe(true);
    });

    it('keeps SUBMITTED status with confirmations=0 when transaction is still in mempool', async () => {
      const pendingRecord = {
        id: 'evt-submitted-2',
        chainStatus: 'SUBMITTED',
        transactionHash: '0x2222333344445555666677778888999900001111aaaabbbbccccddddeeeeffff',
        blockNumber: null,
        confirmations: 0,
        evidenceHash: '0xdef456',
        batchIdBytes32: '0xbatch2',
        idempotencyKey: 'idem-2',
        verified: false,
      };
      mockEventStore.set(pendingRecord.id, pendingRecord);

      // Receipt is null (transaction still in mempool)
      jest.spyOn(blockchainService, 'getTransactionReceipt').mockResolvedValue(null);

      const reconciled = await eventLifecycleService.reconcileEvent(pendingRecord.id, mockPrisma);

      expect(reconciled).not.toBeNull();
      expect(reconciled?.status).toBe('SUBMITTED');
      expect(reconciled?.blockNumber).toBeNull();
      expect(reconciled?.verified).toBe(false);

      const inDb = mockEventStore.get(pendingRecord.id);
      expect(inDb.chainStatus).toBe('SUBMITTED');
    });

    it('reconciles to FAILED when transaction receipt has status=0 (reverted)', async () => {
      const revertedRecord = {
        id: 'evt-reverted-1',
        chainStatus: 'SUBMITTED',
        transactionHash: '0x3333444455556666777788889999000011112222aaaabbbbccccddddeeeeffff',
        blockNumber: null,
        confirmations: 0,
        evidenceHash: '0xghi789',
        batchIdBytes32: '0xbatch3',
        idempotencyKey: 'idem-3',
        verified: false,
      };
      mockEventStore.set(revertedRecord.id, revertedRecord);

      // Receipt status 0 (EVM execution reverted)
      jest.spyOn(blockchainService, 'getTransactionReceipt').mockResolvedValue({
        status: 0,
        blockNumber: 502,
        hash: revertedRecord.transactionHash,
      } as any);

      const reconciled = await eventLifecycleService.reconcileEvent(revertedRecord.id, mockPrisma);

      expect(reconciled).not.toBeNull();
      expect(reconciled?.status).toBe('FAILED');
      expect(reconciled?.verified).toBe(false);

      const inDb = mockEventStore.get(revertedRecord.id);
      expect(inDb.chainStatus).toBe('FAILED');
      expect(inDb.verified).toBe(false);
    });

    it('safely handles unavailable RPC without throwing or falsely corrupting DB state', async () => {
      const inFlightRecord = {
        id: 'evt-submitted-rpc-down',
        chainStatus: 'SUBMITTED',
        transactionHash: '0x4444555566667777888899990000111122223333aaaabbbbccccddddeeeeffff',
        blockNumber: null,
        confirmations: 0,
        evidenceHash: '0xjkl012',
        batchIdBytes32: '0xbatch4',
        idempotencyKey: 'idem-4',
        verified: false,
      };
      mockEventStore.set(inFlightRecord.id, inFlightRecord);

      // RPC network error / timeout simulation
      jest.spyOn(blockchainService, 'getTransactionReceipt').mockRejectedValue(
        new Error('connect ECONNREFUSED 127.0.0.1:8545')
      );

      const result = await eventLifecycleService.reconcileEvent(inFlightRecord.id, mockPrisma);

      // Does not throw, returns current in-flight status
      expect(result).not.toBeNull();
      expect(result?.status).toBe('SUBMITTED');
      expect(result?.verified).toBe(false);

      // Database record remains untouched as SUBMITTED (not falsely marked FAILED)
      const inDb = mockEventStore.get(inFlightRecord.id);
      expect(inDb.chainStatus).toBe('SUBMITTED');
    });
  });

  describe('2. Bulk Post-Restart Sweep (reconcileAllPendingEvents)', () => {
    it('accurately sweeps multiple pending records across states in a single recovery sweep', async () => {
      // 1. Mined event -> should become CONFIRMED
      mockEventStore.set('evt-mined', {
        id: 'evt-mined',
        chainStatus: 'SUBMITTED',
        transactionHash: '0xmined1',
      });

      // 2. Mempool event -> should stay SUBMITTED
      mockEventStore.set('evt-pending', {
        id: 'evt-pending',
        chainStatus: 'SUBMITTED',
        transactionHash: '0xpending1',
      });

      // 3. Reverted event -> should become FAILED
      mockEventStore.set('evt-reverted', {
        id: 'evt-reverted',
        chainStatus: 'SUBMITTED',
        transactionHash: '0xreverted1',
      });

      jest.spyOn(blockchainService, 'getTransactionReceipt').mockImplementation(async (txHash: string) => {
        if (txHash === '0xmined1') return { status: 1, blockNumber: 101, hash: txHash } as any;
        if (txHash === '0xreverted1') return { status: 0, blockNumber: 102, hash: txHash } as any;
        return null; // mempool
      });

      const summary = await eventLifecycleService.reconcileAllPendingEvents(mockPrisma);

      expect(summary.processed).toBe(3);
      expect(summary.confirmed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.stillPending).toBe(1);
      expect(summary.unavailable).toBe(0);

      expect(mockEventStore.get('evt-mined').chainStatus).toBe('CONFIRMED');
      expect(mockEventStore.get('evt-reverted').chainStatus).toBe('FAILED');
      expect(mockEventStore.get('evt-pending').chainStatus).toBe('SUBMITTED');
    });
  });

  describe('3. Idempotent Submission & Pre-Broadcast Retry Handling', () => {
    it('returns existing confirmed record without creating duplicate on-chain transaction', async () => {
      const confirmedRecord = {
        id: 'evt-existing-confirmed',
        chainStatus: 'CONFIRMED',
        transactionHash: '0xconfirmedTx',
        blockNumber: 42,
        confirmations: 3,
        evidenceHash: '0xevidenceHash',
        batchIdBytes32: '0xbatchBytes',
        idempotencyKey: 'idem-fixed-123',
        verified: true,
      };
      mockEventStore.set(confirmedRecord.id, confirmedRecord);

      const registerBatchSpy = jest.spyOn(blockchainService, 'registerBatch');
      const recordEventSpy = jest.spyOn(blockchainService, 'recordEvent');

      const result = await eventLifecycleService.recordAndPersistEvent(
        {
          batchId: 'BATCH-FIXED',
          eventType: RegistryEventType.PLANTED,
          evidence: { data: 'test' },
          actorId: 'user-1',
          idempotencyKey: 'idem-fixed-123',
        },
        mockPrisma
      );

      expect(result.status).toBe('CONFIRMED');
      expect(result.isReplay).toBe(true);
      expect(result.transactionHash).toBe('0xconfirmedTx');
      expect(registerBatchSpy).not.toHaveBeenCalled();
      expect(recordEventSpy).not.toHaveBeenCalled();
    });

    it('safely retries an unbroadcast FAILED event (transactionHash null) without duplicate key error', async () => {
      const unbroadcastFailed = {
        id: 'evt-failed-pre-broadcast',
        chainStatus: 'FAILED',
        transactionHash: null, // Failed before network broadcast
        blockNumber: null,
        confirmations: 0,
        evidenceHash: '0xev1',
        batchIdBytes32: '0xbatch1',
        idempotencyKey: 'idem-retry-1',
        verified: false,
      };
      mockEventStore.set(unbroadcastFailed.id, unbroadcastFailed);

      jest.spyOn(blockchainService, 'getBatch').mockResolvedValue(null);
      jest.spyOn(blockchainService, 'registerBatch').mockImplementation(async (batchId, type, hash, actor, onBroadcast) => {
        if (onBroadcast) await onBroadcast('0xnewRealTxHash');
        return {
          txHash: '0xnewRealTxHash',
          blockNumber: 105,
          batchIdBytes32: '0xbatch1',
          evidenceHash: hash,
          confirmations: 1,
          simulated: false,
        };
      });

      const retryResult = await eventLifecycleService.recordAndPersistEvent(
        {
          batchId: 'BATCH-RETRY',
          eventType: RegistryEventType.PLANTED,
          evidence: { stage: 'PLANTED' },
          actorId: 'user-1',
          idempotencyKey: 'idem-retry-1',
        },
        mockPrisma
      );

      expect(retryResult.status).toBe('CONFIRMED');
      expect(retryResult.transactionHash).toBe('0xnewRealTxHash');
      expect(retryResult.blockNumber).toBe(105);

      const inDb = mockEventStore.get(unbroadcastFailed.id);
      expect(inDb.chainStatus).toBe('CONFIRMED');
      expect(inDb.transactionHash).toBe('0xnewRealTxHash');
    });
  });
});
