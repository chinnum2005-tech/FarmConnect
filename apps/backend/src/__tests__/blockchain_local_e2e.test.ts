import { ethers } from 'ethers';
import { blockchainService, RegistryEventType, toRegistryEventType } from '../services/blockchain.service';
import { hashEvidence, toBatchIdBytes32 } from '../services/evidenceHasher';
import { verifyOnChainProduce, verifyProduct } from '../controllers/verify.controller';

/**
 * PROJECT LEAD DIRECTIVE 012: LOCAL END-TO-END BLOCKCHAIN VERIFICATION
 *
 * Runs actual backend blockchain services and controllers against the REAL
 * locally deployed AgroTraceRegistry contract running on the local Hardhat node (http://127.0.0.1:8545).
 *
 * Demonstrates:
 * - Real local transaction receipts and block inclusions
 * - Batch registration with atomic initial evidence commitment
 * - Appending subsequent trace events
 * - Honest attribution: submitter is relayer; originating actor is attested
 * - Cryptographic independent verification (VERIFIED vs MISMATCH vs NOT_FOUND vs PENDING vs UNAVAILABLE)
 * - Safe retry, duplicate rejection, and concurrency handling
 * - API controller route compatibility
 */
describe('Directive 012: Local End-to-End Blockchain Verification Suite', () => {
  const localProvider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');

  const testBatchId = `BATCH-E2E-2026-${Date.now()}`;
  const actorAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Hardhat account #1

  // Synthetic off-chain evidence payloads
  const initialPlantingEvidence = {
    batchId: testBatchId,
    crop: 'Organic Durum Wheat',
    fieldId: 'FIELD-NORTH-04',
    plantingDate: '2026-03-15T08:00:00.000Z',
    seedLot: 'SEED-LOT-WHEAT-992',
    farmerPhone: '+91 98765 43210', // PII: will be stripped by evidenceHasher
  };

  const harvestEvidence = {
    batchId: testBatchId,
    harvestDate: '2026-07-20T11:30:00.000Z',
    yieldKg: 4500,
    moisturePercent: 12.4,
    weatherConditions: {
      temperatureC: 28,
      humidityPercent: 45,
    },
    combineOperator: 'OPERATOR-42',
  };

  const qualityInspectionEvidence = {
    batchId: testBatchId,
    inspectionDate: '2026-07-22T14:15:00.000Z',
    inspectorRole: 'QUALITY_CONTROL',
    proteinContentPercent: 14.2,
    fallingNumberSeconds: 380,
    grade: 'GRADE_A_PREMIUM',
    labId: 'LAB-AGRI-CENTRAL-01',
    passed: true,
  };

  let registeredTxHash: string;
  let harvestTxHash: string;
  let inspectionTxHash: string;

  beforeAll(async () => {
    // Confirm local node is responsive and chain ID is 31337
    const network = await localProvider.getNetwork();
    expect(Number(network.chainId)).toBe(31337);

    const config = blockchainService.getConfig();
    expect(config.rpcUrl).toContain('127.0.0.1:8545');
    expect(config.contractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  // =========================================================================
  // SCENARIO A: Register a Batch
  // =========================================================================
  describe('Scenario A — Register a produce batch on local chain', () => {
    it('anchors the batch with initial evidence commitment and receives a real receipt', async () => {
      const evidenceHash = hashEvidence(initialPlantingEvidence);
      const batchIdBytes32 = toBatchIdBytes32(testBatchId);

      const result = await blockchainService.registerBatch(
        testBatchId,
        RegistryEventType.PLANTED,
        evidenceHash,
        actorAddress
      );

      expect(result.simulated).toBe(false);
      expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.confirmations).toBe(1);
      registeredTxHash = result.txHash;

      // Verify transaction receipt exists directly on local chain
      const receipt = await localProvider.getTransactionReceipt(result.txHash);
      expect(receipt).not.toBeNull();
      expect(receipt?.status).toBe(1); // 1 = EVM Success

      // Verify on-chain contract state
      const onChainBatch = await blockchainService.getBatch(testBatchId);
      expect(onChainBatch).not.toBeNull();
      expect(onChainBatch?.exists).toBe(true);
      expect(onChainBatch?.initialEventType).toBe(RegistryEventType.PLANTED);
      expect(onChainBatch?.initialEvidenceHash).toBe(evidenceHash);
      expect(onChainBatch?.eventCount).toBe(1);

      // Verify initial event at index 0
      const event0 = await blockchainService.getEventByIndex(testBatchId, 0);
      expect(event0).not.toBeNull();
      expect(event0?.eventType).toBe(RegistryEventType.PLANTED);
      expect(event0?.evidenceHash).toBe(evidenceHash);
      expect(event0?.originatingActor.toLowerCase()).toBe(actorAddress.toLowerCase());
      expect(event0?.submitter).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });
  });

  // =========================================================================
  // SCENARIO B: Append Trace Events
  // =========================================================================
  describe('Scenario B — Append subsequent trace events to the batch', () => {
    it('appends HARVESTED and QUALITY_CHECK events on-chain with truthful attribution', async () => {
      const harvestHash = hashEvidence(harvestEvidence);
      const harvestResult = await blockchainService.recordEvent(
        testBatchId,
        RegistryEventType.HARVESTED,
        harvestHash,
        actorAddress
      );

      expect(harvestResult.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(harvestResult.blockNumber).toBeGreaterThan(0);
      harvestTxHash = harvestResult.txHash;

      const qcHash = hashEvidence(qualityInspectionEvidence);
      const qcResult = await blockchainService.recordEvent(
        testBatchId,
        RegistryEventType.QUALITY_CHECK,
        qcHash,
        actorAddress
      );

      expect(qcResult.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      inspectionTxHash = qcResult.txHash;

      // Verify total event count on-chain is 3
      const count = await blockchainService.getEventCount(testBatchId);
      expect(count).toBe(3);

      // Verify each event on-chain
      const event1 = await blockchainService.getEventByIndex(testBatchId, 1);
      expect(event1?.eventType).toBe(RegistryEventType.HARVESTED);
      expect(event1?.evidenceHash).toBe(harvestHash);

      const event2 = await blockchainService.getEventByIndex(testBatchId, 2);
      expect(event2?.eventType).toBe(RegistryEventType.QUALITY_CHECK);
      expect(event2?.evidenceHash).toBe(qcHash);

      // Verify getBatchEvents returns all 3 chronological events
      const allEvents = await blockchainService.getBatchEvents(testBatchId);
      expect(allEvents.length).toBe(3);
      expect(allEvents[0].eventType).toBe(RegistryEventType.PLANTED);
      expect(allEvents[1].eventType).toBe(RegistryEventType.HARVESTED);
      expect(allEvents[2].eventType).toBe(RegistryEventType.QUALITY_CHECK);

      // Verify submitter is the relayer account (not fabricated as originating actor's private key)
      const relayerAddress = (await blockchainService.getSignerContract()).wallet.address;
      expect(allEvents[1].submitter.toLowerCase()).toBe(relayerAddress.toLowerCase());
      expect(allEvents[1].originatingActor.toLowerCase()).toBe(actorAddress.toLowerCase());
    });
  });

  // =========================================================================
  // SCENARIO C: Verify Genuine Evidence
  // =========================================================================
  describe('Scenario C — Verify genuine off-chain evidence against contract commitments', () => {
    it('returns VERIFIED when recomputed evidence hash matches on-chain commitment', async () => {
      // 1. Verify initial planting event
      const plantVerify = await blockchainService.verifyOnChain(
        testBatchId,
        RegistryEventType.PLANTED,
        initialPlantingEvidence
      );

      expect(plantVerify.status).toBe('VERIFIED');
      expect(plantVerify.match).toBe(true);
      expect(plantVerify.onChainBatchExists).toBe(true);
      expect(plantVerify.computedEvidenceHash).toBe(hashEvidence(initialPlantingEvidence));

      // 2. Verify harvested event
      const harvestVerify = await blockchainService.verifyOnChain(
        testBatchId,
        RegistryEventType.HARVESTED,
        harvestEvidence
      );

      expect(harvestVerify.status).toBe('VERIFIED');
      expect(harvestVerify.match).toBe(true);

      // 3. Verify quality check event
      const qcVerify = await blockchainService.verifyOnChain(
        testBatchId,
        RegistryEventType.QUALITY_CHECK,
        qualityInspectionEvidence
      );

      expect(qcVerify.status).toBe('VERIFIED');
      expect(qcVerify.match).toBe(true);
    });

    it('remains VERIFIED even if property ordering is shuffled in off-chain evidence', async () => {
      // Shuffled property order of harvest evidence
      const shuffledHarvest = {
        combineOperator: harvestEvidence.combineOperator,
        moisturePercent: harvestEvidence.moisturePercent,
        weatherConditions: {
          humidityPercent: harvestEvidence.weatherConditions.humidityPercent,
          temperatureC: harvestEvidence.weatherConditions.temperatureC,
        },
        batchId: harvestEvidence.batchId,
        yieldKg: harvestEvidence.yieldKg,
        harvestDate: harvestEvidence.harvestDate,
      };

      const result = await blockchainService.verifyOnChain(
        testBatchId,
        RegistryEventType.HARVESTED,
        shuffledHarvest
      );

      expect(result.status).toBe('VERIFIED');
      expect(result.match).toBe(true);
    });
  });

  // =========================================================================
  // SCENARIO D: Reject Tampered Evidence & Honest Error States
  // =========================================================================
  describe('Scenario D — Reject tampered evidence and distinguish error states', () => {
    it('returns MISMATCH when a single field in off-chain evidence has been altered', async () => {
      const tamperedHarvest = {
        ...harvestEvidence,
        moisturePercent: 19.8, // Tampered value (was 12.4)
      };

      const result = await blockchainService.verifyOnChain(
        testBatchId,
        RegistryEventType.HARVESTED,
        tamperedHarvest
      );

      expect(result.status).toBe('MISMATCH');
      expect(result.match).toBe(false);
      expect(result.onChainBatchExists).toBe(true);
      expect(result.details).toContain('Evidence hash mismatch');
    });

    it('returns NOT_FOUND when querying a batch that has never been registered on-chain', async () => {
      const ghostBatchId = `BATCH-GHOST-${Date.now()}`;
      const result = await blockchainService.verifyOnChain(
        ghostBatchId,
        RegistryEventType.PLANTED,
        { batchId: ghostBatchId }
      );

      expect(result.status).toBe('NOT_FOUND');
      expect(result.match).toBe(false);
      expect(result.onChainBatchExists).toBe(false);
      expect(result.details).toContain('has not been registered on the blockchain');
    });

    it('returns UNAVAILABLE when contract address or RPC configuration is absent', async () => {
      const spy = jest.spyOn(blockchainService, 'getConfig').mockReturnValueOnce({
        mode: 'local',
        rpcUrl: 'http://127.0.0.1:8545',
        contractAddress: '', // explicitly unconfigured contract
        privateKey: '',
        expectedChainId: 31337,
      });

      const result = await blockchainService.verifyOnChain(
        testBatchId,
        RegistryEventType.PLANTED,
        initialPlantingEvidence
      );

      expect(result.status).toBe('UNAVAILABLE');
      expect(result.match).toBe(false);
      expect(result.details).toContain('Missing AGROTRACE_REGISTRY_ADDRESS');
      spy.mockRestore();
    });

    it('returns UNAVAILABLE when the RPC network connection refuses connection', async () => {
      const spy = jest.spyOn(blockchainService, 'getReadOnlyContract').mockRejectedValueOnce(
        new Error('connect ECONNREFUSED 127.0.0.1:8545')
      );

      try {
        const result = await blockchainService.verifyOnChain(
          testBatchId,
          RegistryEventType.PLANTED,
          initialPlantingEvidence
        );

        expect(result.status).toBe('UNAVAILABLE');
        expect(result.match).toBe(false);
        expect(result.details).toContain('ECONNREFUSED');
      } finally {
        spy.mockRestore();
      }
    });
  });

  // =========================================================================
  // SCENARIO E: Retry and Failure Behavior
  // =========================================================================
  describe('Scenario E — Retry, duplicate prevention and concurrency behavior', () => {
    it('reverts when attempting to register an already-registered batch ID', async () => {
      const evidenceHash = hashEvidence(initialPlantingEvidence);

      await expect(
        blockchainService.registerBatch(
          testBatchId,
          RegistryEventType.PLANTED,
          evidenceHash,
          actorAddress
        )
      ).rejects.toThrow();
    });

    it('reverts when attempting to record a duplicate event commitment on the same batch', async () => {
      const harvestHash = hashEvidence(harvestEvidence);

      // Attempting to record identical (batchId, HARVESTED, harvestHash) again
      await expect(
        blockchainService.recordEvent(
          testBatchId,
          RegistryEventType.HARVESTED,
          harvestHash,
          actorAddress
        )
      ).rejects.toThrow();
    });

    it('safely serializes concurrent event submissions without nonce collision', async () => {
      const concurrentBatchId = `BATCH-CONC-E2E-${Date.now()}`;
      const initHash = hashEvidence({ id: concurrentBatchId, stage: 'PLANTED' });

      // First register the batch
      await blockchainService.registerBatch(
        concurrentBatchId,
        RegistryEventType.PLANTED,
        initHash,
        actorAddress
      );

      // Dispatch 3 distinct events concurrently
      const evt1Hash = hashEvidence({ id: concurrentBatchId, stage: 'PROCESSED' });
      const evt2Hash = hashEvidence({ id: concurrentBatchId, stage: 'PACKAGED' });
      const evt3Hash = hashEvidence({ id: concurrentBatchId, stage: 'SHIPPED' });

      const [res1, res2, res3] = await Promise.all([
        blockchainService.recordEvent(concurrentBatchId, RegistryEventType.PROCESSED, evt1Hash, actorAddress),
        blockchainService.recordEvent(concurrentBatchId, RegistryEventType.PACKAGED, evt2Hash, actorAddress),
        blockchainService.recordEvent(concurrentBatchId, RegistryEventType.SHIPPED, evt3Hash, actorAddress),
      ]);

      expect(res1.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(res2.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(res3.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

      // Verify all 4 events exist on-chain
      const count = await blockchainService.getEventCount(concurrentBatchId);
      expect(count).toBe(4);
    });

    it('returns PENDING when a transaction hash is provided for an in-flight submission', async () => {
      const unminedBatch = `BATCH-UNMINED-${Date.now()}`;
      const pendingTx = '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';

      const result = await blockchainService.verifyOnChain(
        unminedBatch,
        RegistryEventType.PLANTED,
        { id: unminedBatch },
        pendingTx
      );

      expect(result.status).toBe('PENDING');
      expect(result.transactionHash).toBe(pendingTx);
      expect(result.match).toBe(false);
      expect(result.onChainBatchExists).toBe(false);
    });
  });

  // =========================================================================
  // SCENARIO F: API and Controller Compatibility
  // =========================================================================
  describe('Scenario F — Controller routes, API shapes and persistence compatibility', () => {
    it('executes verifyOnChainProduce HTTP controller handler for verified on-chain batch', async () => {
      const mockReq = {
        params: { identifier: testBatchId },
        query: {
          eventType: 'HARVESTED',
          evidence: JSON.stringify(harvestEvidence),
        },
        body: {},
      };

      let jsonResponse: any = null;
      const mockRes: any = {
        json: (data: any) => {
          jsonResponse = data;
          return mockRes;
        },
        status: (code: number) => mockRes,
      };

      await verifyOnChainProduce(mockReq, mockRes);

      expect(jsonResponse).not.toBeNull();
      expect(jsonResponse.success).toBe(true);
      expect(jsonResponse.data.status).toBe('VERIFIED');
      expect(jsonResponse.data.match).toBe(true);
      expect(jsonResponse.data.batchId).toBe(testBatchId);
    }, 15000);

    it('executes verifyOnChainProduce HTTP controller handler for tampered evidence', async () => {
      const mockReq = {
        params: { identifier: testBatchId },
        query: {
          eventType: 'HARVESTED',
          evidence: JSON.stringify({ ...harvestEvidence, yieldKg: 999999 }),
        },
        body: {},
      };

      let jsonResponse: any = null;
      const mockRes: any = {
        json: (data: any) => {
          jsonResponse = data;
          return mockRes;
        },
        status: (code: number) => mockRes,
      };

      await verifyOnChainProduce(mockReq, mockRes);

      expect(jsonResponse).not.toBeNull();
      expect(jsonResponse.success).toBe(true);
      expect(jsonResponse.data.status).toBe('MISMATCH');
      expect(jsonResponse.data.match).toBe(false);
    }, 15000);

    it('existing QR verification route safely returns 404 for nonexistent produce QR codes', async () => {
      const mockReq = {
        params: { qrCode: `NONEXISTENT-QR-${Date.now()}` },
      };

      const mockRes: any = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await expect(verifyProduct(mockReq, mockRes)).rejects.toThrow('Product not found or invalid QR code');
    }, 15000);
  });
});
