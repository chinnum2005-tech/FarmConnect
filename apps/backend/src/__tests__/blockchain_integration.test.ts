import { ethers } from 'ethers';
import {
  hashEvidence,
  canonicalizeData,
  canonicalizeToJson,
  toBatchIdBytes32,
  isValidBytes32,
} from '../services/evidenceHasher';
import {
  BlockchainService,
  RegistryEventType,
  toRegistryEventType,
  AGROTRACE_REGISTRY_ABI,
} from '../services/blockchain.service';
import { computePredictionHash } from '../services/provenance.service';

describe('Directive 011: Backend Blockchain Integration & Invariant Tests', () => {
  let service: BlockchainService;

  beforeEach(() => {
    service = new BlockchainService();
  });

  // -------------------------------------------------------------
  // Test 1: Deterministic evidence hashing
  // -------------------------------------------------------------
  it('1. Deterministic evidence hashing produces valid bytes32 and detects modifications', () => {
    const evidenceA = {
      cropId: '66e01234567890abcdef1234',
      stage: 'PLANTED',
      quantity: 500,
      qualityGrade: 'A',
    };

    const hashA = hashEvidence(evidenceA);
    expect(isValidBytes32(hashA)).toBe(true);
    expect(hashA).toMatch(/^0x[0-9a-f]{64}$/);

    // Modified evidence (different quantity)
    const evidenceModified = {
      ...evidenceA,
      quantity: 501,
    };
    const hashModified = hashEvidence(evidenceModified);
    expect(hashModified).not.toBe(hashA);
  });

  // -------------------------------------------------------------
  // Test 2: Property-order-independent canonicalization
  // -------------------------------------------------------------
  it('2. Property-order-independent canonicalization normalizes objects and strips PII', () => {
    const obj1 = {
      zebra: 'stripes',
      alpha: 100,
      nested: { beta: 'two', apple: 'fruit' },
      farmerPhone: '+919876543210', // PII to be stripped
      price: 1500,                  // Commercial price to be stripped
    };

    const obj2 = {
      price: 99999,                  // Should be ignored
      alpha: 100,
      nested: { apple: 'fruit', beta: 'two' },
      farmerPhone: '+910000000000',  // Should be ignored
      zebra: 'stripes',
    };

    const canonical1 = canonicalizeToJson(obj1);
    const canonical2 = canonicalizeToJson(obj2);

    expect(canonical1).toBe(canonical2);
    expect(hashEvidence(obj1)).toBe(hashEvidence(obj2));

    // Ensure PII was stripped from canonical JSON
    expect(canonical1).not.toContain('farmerPhone');
    expect(canonical1).not.toContain('price');
  });

  // -------------------------------------------------------------
  // Test 3: Stable batch-ID validation
  // -------------------------------------------------------------
  it('3. Stable batch-ID validation formats strings and raw hashes deterministically', () => {
    const rawBytes32 = '0x' + 'a'.repeat(64);
    expect(toBatchIdBytes32(rawBytes32)).toBe(rawBytes32);

    const stringBatchId = 'BATCH-2026-WHEAT-001';
    const converted = toBatchIdBytes32(stringBatchId);
    expect(isValidBytes32(converted)).toBe(true);
    // Same string produces identical bytes32
    expect(toBatchIdBytes32('BATCH-2026-WHEAT-001')).toBe(converted);

    // Empty strings must throw
    expect(() => toBatchIdBytes32('')).toThrow('Batch ID must be a non-empty string');
    expect(() => toBatchIdBytes32('   ')).toThrow('Batch ID must be a non-empty string');
  });

  // -------------------------------------------------------------
  // Test 4: Missing or invalid blockchain configuration
  // -------------------------------------------------------------
  it('4. Missing blockchain configuration fails closed without fabricating hashes', async () => {
    const originalNetwork = process.env.BLOCKCHAIN_NETWORK;
    const originalRpc = process.env.RPC_URL;
    const originalPolyRpc = process.env.POLYGON_RPC_URL;
    const originalContract = process.env.AGROTRACE_REGISTRY_ADDRESS;
    const originalTrace = process.env.TRACEABILITY_CONTRACT_ADDRESS;

    try {
      process.env.BLOCKCHAIN_NETWORK = 'amoy';
      delete process.env.RPC_URL;
      delete process.env.POLYGON_RPC_URL;
      delete process.env.AGROTRACE_REGISTRY_ADDRESS;
      delete process.env.TRACEABILITY_CONTRACT_ADDRESS;

      // Read-only contract must fail closed
      await expect(service.getReadOnlyContract()).rejects.toThrow('Missing RPC_URL');

      // Signer contract must fail closed
      await expect(service.getSignerContract()).rejects.toThrow('Missing RPC_URL');
    } finally {
      if (originalNetwork !== undefined) process.env.BLOCKCHAIN_NETWORK = originalNetwork; else delete process.env.BLOCKCHAIN_NETWORK;
      if (originalRpc !== undefined) process.env.RPC_URL = originalRpc; else delete process.env.RPC_URL;
      if (originalPolyRpc !== undefined) process.env.POLYGON_RPC_URL = originalPolyRpc; else delete process.env.POLYGON_RPC_URL;
      if (originalContract !== undefined) process.env.AGROTRACE_REGISTRY_ADDRESS = originalContract; else delete process.env.AGROTRACE_REGISTRY_ADDRESS;
      if (originalTrace !== undefined) process.env.TRACEABILITY_CONTRACT_ADDRESS = originalTrace; else delete process.env.TRACEABILITY_CONTRACT_ADDRESS;
    }
  });

  // -------------------------------------------------------------
  // Test 5: Chain-ID mismatch
  // -------------------------------------------------------------
  it('5. Chain-ID mismatch blocks transaction dispatch before submission', async () => {
    const originalChainId = process.env.POLYGON_CHAIN_ID;
    const originalRpc = process.env.RPC_URL;
    const originalContract = process.env.AGROTRACE_REGISTRY_ADDRESS;
    const originalKey = process.env.RELAYER_PRIVATE_KEY;

    try {
      process.env.POLYGON_CHAIN_ID = '999999'; // Expected chain ID
      process.env.RPC_URL = 'http://127.0.0.1:8545';
      process.env.AGROTRACE_REGISTRY_ADDRESS = '0x1234567890123456789012345678901234567890';
      process.env.RELAYER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

      // Mock provider getNetwork to return chainId 31337
      const mockProvider = {
        getNetwork: jest.fn().mockResolvedValue({ chainId: 31337n }),
      };
      jest.spyOn(ethers, 'JsonRpcProvider').mockReturnValue(mockProvider as any);

      await expect(service.getSignerContract()).rejects.toThrow('Chain ID mismatch');
    } finally {
      jest.restoreAllMocks();
      if (originalChainId !== undefined) process.env.POLYGON_CHAIN_ID = originalChainId; else delete process.env.POLYGON_CHAIN_ID;
      if (originalRpc !== undefined) process.env.RPC_URL = originalRpc; else delete process.env.RPC_URL;
      if (originalContract !== undefined) process.env.AGROTRACE_REGISTRY_ADDRESS = originalContract; else delete process.env.AGROTRACE_REGISTRY_ADDRESS;
      if (originalKey !== undefined) process.env.RELAYER_PRIVATE_KEY = originalKey; else delete process.env.RELAYER_PRIVATE_KEY;
    }
  });

  // -------------------------------------------------------------
  // Test 6: Correct contract function calls and event enum mapping
  // -------------------------------------------------------------
  it('6. Event enum mapping strictly matches AgroTrace lifecycle stages', () => {
    expect(toRegistryEventType('PLANTED')).toBe(RegistryEventType.PLANTED);
    expect(toRegistryEventType('HARVESTED')).toBe(RegistryEventType.HARVESTED);
    expect(toRegistryEventType('PROCESSED')).toBe(RegistryEventType.PROCESSED);
    expect(toRegistryEventType('PACKAGED')).toBe(RegistryEventType.PACKAGED);
    expect(toRegistryEventType('SHIPPED')).toBe(RegistryEventType.SHIPPED);
    expect(toRegistryEventType('RECEIVED')).toBe(RegistryEventType.RECEIVED);
    expect(toRegistryEventType('QUALITY_CHECK')).toBe(RegistryEventType.QUALITY_CHECK);
    expect(toRegistryEventType('RETAIL')).toBe(RegistryEventType.RETAIL);
    expect(toRegistryEventType('SOLD')).toBe(RegistryEventType.SOLD);

    // Number pass-through
    expect(toRegistryEventType(0)).toBe(RegistryEventType.PLANTED);
    expect(toRegistryEventType(8)).toBe(RegistryEventType.SOLD);

    // Invalid codes
    expect(() => toRegistryEventType('INVALID_STAGE')).toThrow('Unrecognized event type');
    expect(() => toRegistryEventType(99)).toThrow('Invalid event type numeric code');
  });

  // -------------------------------------------------------------
  // Test 7: Successful registration and event submission
  // -------------------------------------------------------------
  it('7. Successful registration calls contract and returns genuine confirmed receipt', async () => {
    const mockTx = {
      hash: '0xrealhash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
      wait: jest.fn().mockResolvedValue({
        hash: '0xrealhash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
        blockNumber: 1042,
      }),
    };

    const mockContract = {
      registerBatch: jest.fn().mockResolvedValue(mockTx),
    };

    jest.spyOn(service, 'getSignerContract').mockResolvedValue({
      contract: mockContract as any,
      provider: {} as any,
      wallet: {} as any,
    });

    const validHash = '0x' + 'b'.repeat(64);
    const result = await service.registerBatch('BATCH-101', RegistryEventType.PLANTED, validHash);

    expect(result.txHash).toBe(mockTx.hash);
    expect(result.blockNumber).toBe(1042);
    expect(result.simulated).toBe(false);
    expect(mockContract.registerBatch).toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Test 8: Reverted transactions
  // -------------------------------------------------------------
  it('8. Reverted transaction propagates EVM error and does not swallow failure', async () => {
    const mockContract = {
      registerBatch: jest.fn().mockRejectedValue(new Error('execution reverted: Batch already registered')),
    };

    jest.spyOn(service, 'getSignerContract').mockResolvedValue({
      contract: mockContract as any,
      provider: {} as any,
      wallet: {} as any,
    });

    const validHash = '0x' + 'c'.repeat(64);
    await expect(
      service.registerBatch('BATCH-DUP', RegistryEventType.PLANTED, validHash)
    ).rejects.toThrow('Batch already registered');
  });

  // -------------------------------------------------------------
  // Test 9: RPC failures and unavailable verification
  // -------------------------------------------------------------
  it('9. RPC failure in verification returns UNAVAILABLE without crashing', async () => {
    jest.spyOn(service, 'getReadOnlyContract').mockRejectedValue(new Error('CONNECTION_REFUSED'));

    const result = await service.verifyOnChain('BATCH-XYZ', RegistryEventType.PLANTED, { foo: 'bar' });
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.match).toBe(false);
    expect(result.details).toContain('CONNECTION_REFUSED');
  });

  // -------------------------------------------------------------
  // Test 10: Duplicate retries and concurrent submissions
  // -------------------------------------------------------------
  it('10. Concurrent submission calls are serialized through the internal mutex', async () => {
    let activeExecutions = 0;
    let maxConcurrency = 0;

    const mockTx = {
      wait: jest.fn().mockImplementation(async () => {
        activeExecutions++;
        maxConcurrency = Math.max(maxConcurrency, activeExecutions);
        // Simulate async mining delay
        await new Promise(resolve => setTimeout(resolve, 20));
        activeExecutions--;
        return { hash: '0xtxhash', blockNumber: 100 };
      }),
    };

    const mockContract = {
      recordEvent: jest.fn().mockResolvedValue(mockTx),
    };

    jest.spyOn(service, 'getSignerContract').mockResolvedValue({
      contract: mockContract as any,
      provider: {} as any,
      wallet: {} as any,
    });

    const hash = '0x' + 'd'.repeat(64);

    // Launch 3 simultaneous requests
    const promise1 = service.recordEvent('BATCH-CONC', RegistryEventType.HARVESTED, hash);
    const promise2 = service.recordEvent('BATCH-CONC', RegistryEventType.SHIPPED, hash);
    const promise3 = service.recordEvent('BATCH-CONC', RegistryEventType.RECEIVED, hash);

    await Promise.all([promise1, promise2, promise3]);

    // Mutex should guarantee maxConcurrency == 1
    expect(maxConcurrency).toBe(1);
    expect(mockContract.recordEvent).toHaveBeenCalledTimes(3);
  });

  // -------------------------------------------------------------
  // Test 11: Evidence-hash mismatch detection
  // -------------------------------------------------------------
  it('11. Evidence-hash mismatch detects off-chain data tampering', async () => {
    // Contract returns on-chain batch exists
    jest.spyOn(service, 'getBatch').mockResolvedValue({
      batchId: '0x' + '1'.repeat(64),
      initialEventType: RegistryEventType.PLANTED,
      initialEvidenceHash: '0x' + 'e'.repeat(64),
      registeredAt: new Date(),
      exists: true,
      eventCount: 1,
    });

    // But verifyCommitment returns false for tampered evidence
    jest.spyOn(service, 'verifyCommitment').mockResolvedValue(false);

    const tamperedEvidence = { crop: 'Wheat', weight: 9999 }; // Tampered!
    const result = await service.verifyOnChain('BATCH-TAMPERED', RegistryEventType.PLANTED, tamperedEvidence);

    expect(result.status).toBe('MISMATCH');
    expect(result.onChainBatchExists).toBe(true);
    expect(result.match).toBe(false);
    expect(result.details).toContain('Evidence hash mismatch');
  });

  // -------------------------------------------------------------
  // Test 12: Nonexistent on-chain batches
  // -------------------------------------------------------------
  it('12. Nonexistent on-chain batch returns NOT_FOUND', async () => {
    jest.spyOn(service, 'getBatch').mockResolvedValue(null);

    const result = await service.verifyOnChain('BATCH-GHOST', RegistryEventType.PLANTED, { item: 'ghost' });
    expect(result.status).toBe('NOT_FOUND');
    expect(result.onChainBatchExists).toBe(false);
    expect(result.match).toBe(false);
  });

  // -------------------------------------------------------------
  // Test 13: Confirmation versus pending state
  // -------------------------------------------------------------
  it('13. Pending transaction returns PENDING verification state', async () => {
    jest.spyOn(service, 'getBatch').mockResolvedValue(null);

    const pendingTx = '0xpendingtx1234567890abcdef1234567890abcdef1234567890abcdef12345678';
    const result = await service.verifyOnChain('BATCH-PENDING', RegistryEventType.PLANTED, { item: 'fresh' }, pendingTx);

    expect(result.status).toBe('PENDING');
    expect(result.transactionHash).toBe(pendingTx);
    expect(result.match).toBe(false);
  });

  // -------------------------------------------------------------
  // Test 14: Regression test against fabricated hashes
  // -------------------------------------------------------------
  it('14. Blockchain service never returns simulated: true or fabricated random hashes', async () => {
    const mockTx = {
      hash: '0xgenuinehash00000000000000000000000000000000000000000000000000000000',
      wait: jest.fn().mockResolvedValue({
        hash: '0xgenuinehash00000000000000000000000000000000000000000000000000000000',
        blockNumber: 500,
      }),
    };

    jest.spyOn(service, 'getSignerContract').mockResolvedValue({
      contract: { registerBatch: jest.fn().mockResolvedValue(mockTx) } as any,
      provider: {} as any,
      wallet: {} as any,
    });

    const result = await service.registerBatch('BATCH-TEST', RegistryEventType.PLANTED, '0x' + 'f'.repeat(64));
    expect(result.simulated).toBe(false);
    expect(result.txHash).toBe(mockTx.hash);
  });

  // -------------------------------------------------------------
  // Test 15: Compatibility with existing AI provenance behavior
  // -------------------------------------------------------------
  it('15. AI prediction provenance hashing remains property-order invariant and compatible', () => {
    const inputSnapshotA = { nitrogen: 45, rainfall: 820, temperature: 28 };
    const inputSnapshotB = { temperature: 28, nitrogen: 45, rainfall: 820 };

    const hashA = computePredictionHash(inputSnapshotA, 'v1.0.0', 3200);
    const hashB = computePredictionHash(inputSnapshotB, 'v1.0.0', 3200);

    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
  });
});
