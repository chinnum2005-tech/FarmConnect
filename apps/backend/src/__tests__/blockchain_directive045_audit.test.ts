import { Request, Response } from 'express';
import { verifyOnChainProduce } from '../controllers/verify.controller';
import { blockchainService, RegistryEventType } from '../services/blockchain.service';
import { eventLifecycleService } from '../services/eventLifecycle.service';
import { hashEvidence, toBatchIdBytes32 } from '../services/evidenceHasher';
import prisma from '../database/prisma';

describe('Directive 045 — Final Blockchain Security and Integration Audit Suite', () => {
  const BATCH_ID = 'BATCH-D045-SECURITY-TEST-001';
  const BATCH_ID_BYTES32 = toBatchIdBytes32(BATCH_ID);

  const genuineMetadata = {
    cropName: 'Organic Alphonso Mango',
    variety: 'Ratnagiri Grade A',
    farmLocation: 'Maharashtra, India',
    harvestDate: '2026-05-10',
    quantityKg: 500,
  };

  const genuineEvidenceHash = hashEvidence(genuineMetadata);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Evidence verification security', () => {
    it('does not allow client-supplied manipulated evidence to override authoritative stored batch data', async () => {
      // Mock crop and latestEvent in database
      const mockCrop = {
        id: BATCH_ID,
        name: 'Organic Alphonso Mango',
        type: 'MANGO',
        variety: 'Ratnagiri Grade A',
        plantingDate: new Date('2025-01-01'),
        growthStage: 'HARVESTED',
        farm: { name: 'Alphonso Orchards' },
      };

      const mockLatestEvent = {
        id: 'evt-001',
        cropId: BATCH_ID,
        eventType: 'HARVESTED',
        metadata: JSON.stringify(genuineMetadata),
        evidenceHash: genuineEvidenceHash,
        chainStatus: 'CONFIRMED',
        transactionHash: '0x' + '1'.repeat(64),
      };

      jest.spyOn(prisma.product, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.crop, 'findFirst').mockResolvedValue(mockCrop as any);
      jest.spyOn(prisma.supplyChainEvent, 'findFirst').mockResolvedValue(mockLatestEvent as any);

      // Client supplies MANIPULATED evidence in request body (e.g. attempting to claim a different quantity or crop)
      const manipulatedClientPayload = {
        cropName: 'Conventional Mango',
        quantityKg: 9999,
      };

      const req: any = {
        params: { identifier: BATCH_ID },
        query: {},
        body: { evidence: manipulatedClientPayload },
      };

      let jsonResponse: any = null;
      const res: any = {
        json: (data: any) => {
          jsonResponse = data;
          return res;
        },
        status: () => res,
      };

      await verifyOnChainProduce(req, res);

      expect(jsonResponse).toBeDefined();
      expect(jsonResponse.success).toBe(true);
      expect(jsonResponse.data.status).toBe('MISMATCH');
      expect(jsonResponse.data.match).toBe(false);
      expect(jsonResponse.data.details).toContain('client-supplied evidence contradicts authoritative registered batch data');
    });

    it('rejects tampered stored database metadata against on-chain commitment returning MISMATCH', async () => {
      // Scenario: Database was modified by an unauthorized database admin or intruder
      const tamperedDatabaseMetadata = {
        cropName: 'Tampered Mango Record',
        variety: 'Fraudulent Variety',
        quantityKg: 200,
      };

      const mockCrop = {
        id: BATCH_ID,
        name: 'Tampered Mango Record',
        type: 'MANGO',
        variety: 'Fraudulent Variety',
        plantingDate: new Date('2025-01-01'),
        growthStage: 'HARVESTED',
        farm: { name: 'Alphonso Orchards' },
      };

      const mockLatestEvent = {
        id: 'evt-002',
        cropId: BATCH_ID,
        eventType: 'HARVESTED',
        metadata: JSON.stringify(tamperedDatabaseMetadata),
        evidenceHash: hashEvidence(tamperedDatabaseMetadata),
        chainStatus: 'CONFIRMED',
        transactionHash: '0x' + '2'.repeat(64),
      };

      jest.spyOn(prisma.product, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.crop, 'findFirst').mockResolvedValue(mockCrop as any);
      jest.spyOn(prisma.supplyChainEvent, 'findFirst').mockResolvedValue(mockLatestEvent as any);

      // Smart contract has original commitment, which does NOT match the tampered metadata
      jest.spyOn(blockchainService, 'verifyOnChain').mockResolvedValue({
        status: 'MISMATCH',
        batchId: BATCH_ID,
        batchIdBytes32: BATCH_ID_BYTES32,
        onChainBatchExists: true,
        computedEvidenceHash: hashEvidence(tamperedDatabaseMetadata),
        match: false,
        details: 'Evidence hash mismatch: off-chain data does not match on-chain commitment.',
      });

      // Standard QR scan with no client body/query
      const req: any = {
        params: { identifier: BATCH_ID },
        query: {},
        body: {},
      };

      let jsonResponse: any = null;
      const res: any = {
        json: (data: any) => {
          jsonResponse = data;
          return res;
        },
        status: () => res,
      };

      await verifyOnChainProduce(req, res);

      expect(jsonResponse).toBeDefined();
      expect(jsonResponse.data.status).toBe('MISMATCH');
      expect(jsonResponse.data.match).toBe(false);
    });

    it('returns VERIFIED only when authentic stored metadata matches on-chain commitment', async () => {
      const mockCrop = {
        id: BATCH_ID,
        name: 'Organic Alphonso Mango',
        type: 'MANGO',
        variety: 'Ratnagiri Grade A',
        plantingDate: new Date('2025-01-01'),
        growthStage: 'HARVESTED',
        farm: { name: 'Alphonso Orchards' },
      };

      const mockLatestEvent = {
        id: 'evt-003',
        cropId: BATCH_ID,
        eventType: 'HARVESTED',
        metadata: JSON.stringify(genuineMetadata),
        evidenceHash: genuineEvidenceHash,
        chainStatus: 'CONFIRMED',
        transactionHash: '0x' + '3'.repeat(64),
      };

      jest.spyOn(prisma.product, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.crop, 'findFirst').mockResolvedValue(mockCrop as any);
      jest.spyOn(prisma.supplyChainEvent, 'findFirst').mockResolvedValue(mockLatestEvent as any);

      jest.spyOn(blockchainService, 'verifyOnChain').mockResolvedValue({
        status: 'VERIFIED',
        batchId: BATCH_ID,
        batchIdBytes32: BATCH_ID_BYTES32,
        onChainBatchExists: true,
        computedEvidenceHash: genuineEvidenceHash,
        onChainEvidenceHash: genuineEvidenceHash,
        match: true,
        details: 'Cryptographic evidence verified against on-chain commitment.',
      });

      const req: any = {
        params: { identifier: BATCH_ID },
        query: {},
        body: {},
      };

      let jsonResponse: any = null;
      const res: any = {
        json: (data: any) => {
          jsonResponse = data;
          return res;
        },
        status: () => res,
      };

      await verifyOnChainProduce(req, res);

      expect(jsonResponse).toBeDefined();
      expect(jsonResponse.data.status).toBe('VERIFIED');
      expect(jsonResponse.data.match).toBe(true);
      expect(jsonResponse.data.computedEvidenceHash).toBe(genuineEvidenceHash);
    });
  });

  describe('2. Transaction recovery correctness', () => {
    it('keeps transaction in SUBMITTED state if confirmations are less than required confirmations', async () => {
      const mockEvent = {
        id: 'evt-pending-depth',
        chainStatus: 'SUBMITTED',
        transactionHash: '0x' + 'a'.repeat(64),
        blockNumber: 100,
        confirmations: 1,
        evidenceHash: genuineEvidenceHash,
        batchIdBytes32: BATCH_ID_BYTES32,
      };

      const mockPrisma = {
        supplyChainEvent: {
          findUnique: jest.fn().mockResolvedValue(mockEvent),
          update: jest.fn(),
        },
      };

      // Mock receipt with 1 confirmation, but network requires 3 confirmations (e.g. Amoy)
      jest.spyOn(blockchainService, 'getReceiptAndConfirmations').mockResolvedValue({
        receipt: { status: 1, blockNumber: 100 } as any,
        confirmations: 1,
        requiredConfirmations: 3,
      });

      const result = await eventLifecycleService.reconcileEvent(mockEvent.id, mockPrisma);

      expect(result).toBeDefined();
      expect(result?.status).toBe('SUBMITTED');
      expect(result?.confirmations).toBe(1);
      expect(result?.verified).toBe(false);
      // DB must not have been updated to CONFIRMED
      expect(mockPrisma.supplyChainEvent.update).not.toHaveBeenCalled();
    });

    it('transitions to CONFIRMED only when receipt status is 1 and confirmations meet required depth', async () => {
      const mockEvent = {
        id: 'evt-confirmed-depth',
        chainStatus: 'SUBMITTED',
        transactionHash: '0x' + 'b'.repeat(64),
        blockNumber: 100,
        confirmations: 1,
        evidenceHash: genuineEvidenceHash,
        batchIdBytes32: BATCH_ID_BYTES32,
      };

      const mockUpdatedEvent = {
        ...mockEvent,
        chainStatus: 'CONFIRMED',
        confirmations: 3,
        verified: true,
      };

      const mockPrisma = {
        supplyChainEvent: {
          findUnique: jest.fn().mockResolvedValue(mockEvent),
          update: jest.fn().mockResolvedValue(mockUpdatedEvent),
        },
      };

      // Mock receipt with 3 confirmations meeting required depth
      jest.spyOn(blockchainService, 'getReceiptAndConfirmations').mockResolvedValue({
        receipt: { status: 1, blockNumber: 100 } as any,
        confirmations: 3,
        requiredConfirmations: 3,
      });

      const result = await eventLifecycleService.reconcileEvent(mockEvent.id, mockPrisma);

      expect(result).toBeDefined();
      expect(result?.status).toBe('CONFIRMED');
      expect(result?.confirmations).toBe(3);
      expect(result?.verified).toBe(true);
      expect(mockPrisma.supplyChainEvent.update).toHaveBeenCalledWith({
        where: { id: mockEvent.id },
        data: {
          chainStatus: 'CONFIRMED',
          blockNumber: 100,
          confirmations: 3,
          verified: true,
        },
      });
    });

    it('transitions to FAILED when receipt status is 0 (reverted transaction)', async () => {
      const mockEvent = {
        id: 'evt-reverted',
        chainStatus: 'SUBMITTED',
        transactionHash: '0x' + 'c'.repeat(64),
        blockNumber: 105,
        confirmations: 1,
        evidenceHash: genuineEvidenceHash,
        batchIdBytes32: BATCH_ID_BYTES32,
      };

      const mockFailedEvent = {
        ...mockEvent,
        chainStatus: 'FAILED',
        confirmations: 0,
        verified: false,
      };

      const mockPrisma = {
        supplyChainEvent: {
          findUnique: jest.fn().mockResolvedValue(mockEvent),
          update: jest.fn().mockResolvedValue(mockFailedEvent),
        },
      };

      // Mock reverted receipt (status 0)
      jest.spyOn(blockchainService, 'getReceiptAndConfirmations').mockResolvedValue({
        receipt: { status: 0, blockNumber: 105 } as any,
        confirmations: 1,
        requiredConfirmations: 1,
      });

      const result = await eventLifecycleService.reconcileEvent(mockEvent.id, mockPrisma);

      expect(result).toBeDefined();
      expect(result?.status).toBe('FAILED');
      expect(result?.verified).toBe(false);
      expect(mockPrisma.supplyChainEvent.update).toHaveBeenCalledWith({
        where: { id: mockEvent.id },
        data: {
          chainStatus: 'FAILED',
          blockNumber: 105,
          confirmations: 0,
          verified: false,
        },
      });
    });

    it('does not resubmit or broadcast new transactions for pending in-flight transactions', async () => {
      const registerBatchSpy = jest.spyOn(blockchainService, 'registerBatch');
      const recordEventSpy = jest.spyOn(blockchainService, 'recordEvent');

      const existingSubmittedEvent = {
        id: 'evt-in-flight',
        chainStatus: 'SUBMITTED',
        transactionHash: '0x' + 'd'.repeat(64),
        idempotencyKey: 'idem-test-replay',
        evidenceHash: genuineEvidenceHash,
        batchIdBytes32: BATCH_ID_BYTES32,
      };

      const mockPrisma = {
        supplyChainEvent: {
          findUnique: jest.fn().mockResolvedValue(existingSubmittedEvent),
          update: jest.fn(),
          create: jest.fn(),
        },
      };

      // Mock receipt as still null (in mempool)
      jest.spyOn(blockchainService, 'getReceiptAndConfirmations').mockResolvedValue({
        receipt: null,
        confirmations: 0,
        requiredConfirmations: 1,
      });

      const result = await eventLifecycleService.recordAndPersistEvent({
        batchId: BATCH_ID,
        eventType: RegistryEventType.PLANTED,
        evidence: genuineMetadata,
        actorId: 'usr-1',
        idempotencyKey: 'idem-test-replay',
      }, mockPrisma);

      expect(result.status).toBe('SUBMITTED');
      expect(result.isReplay).toBe(true);
      expect(registerBatchSpy).not.toHaveBeenCalled();
      expect(recordEventSpy).not.toHaveBeenCalled();
    });
  });

  describe('3. Network-specific configuration safety', () => {
    it('fails closed when Polygon Amoy configuration uses localhost RPC', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        BLOCKCHAIN_NETWORK: 'amoy',
        POLYGON_RPC_URL: 'http://127.0.0.1:8545',
      };

      try {
        expect(() => blockchainService.getConfig()).toThrow('Localhost RPC URL');
      } finally {
        process.env = originalEnv;
      }
    });

    it('fails closed when Polygon Amoy uses a known local Hardhat contract address', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        BLOCKCHAIN_NETWORK: 'amoy',
        POLYGON_RPC_URL: 'https://polygon-amoy-bor-rpc.publicnode.com',
        AGROTRACE_REGISTRY_ADDRESS: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      };

      try {
        expect(() => blockchainService.getConfig()).toThrow('Local Hardhat contract address');
      } finally {
        process.env = originalEnv;
      }
    });
  });
});
