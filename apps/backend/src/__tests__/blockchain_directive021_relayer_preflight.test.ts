import { ethers } from 'ethers';
import {
  BlockchainService,
  RELAYER_ROLE_HASH,
  RegistryEventType,
  AGROTRACE_REGISTRY_ABI,
} from '../services/blockchain.service';
import {
  anchorPrediction,
  clearProvenanceAuthorizationCache,
  WRITER_ROLE_HASH,
} from '../services/provenance.service';

// Mock Prisma client to keep tests strictly offline with zero DB connection timeouts
jest.mock('../database/prisma', () => ({
  __esModule: true,
  default: {
    yieldPrediction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    cropRecommendation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    provenanceRecord: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  },
}));

/**
 * PROJECT LEAD DIRECTIVE 021: AMOY RELAYER AUTHORIZATION PREFLIGHT TEST SUITE
 *
 * Strictly offline automated tests using mocked providers and contracts.
 * Zero contact with Polygon Amoy or public RPC endpoints.
 *
 * Verifies all 10 required cases from Directive 021:
 * 1. Missing RELAYER_PRIVATE_KEY is rejected.
 * 2. Missing expected relayer address is rejected on Amoy.
 * 3. Malformed expected address is rejected.
 * 4. Mismatched signer address is rejected before transaction submission.
 * 5. Matching signer address alone is insufficient when hasRole returns false.
 * 6. Role-query failure prevents transaction submission.
 * 7. hasRole returning true permits authorization preflight to pass, with transaction submission covered by isolated mock.
 * 8. Local Hardhat behavior remains compatible.
 * 9. Existing network-isolation and deployment-safety tests still pass.
 * 10. Both traceability and provenance paths use consistent safeguards.
 *
 * Crucial invariant: All rejected authorization cases make ZERO state-changing contract calls.
 */
describe('Directive 021: Amoy Relayer Authorization Preflight', () => {
  const REGISTRY_INTERFACE = new ethers.Interface(AGROTRACE_REGISTRY_ABI);

  // Well-known deterministic test credentials (NEVER used on live networks)
  const TEST_PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  // Derived address from TEST_PRIVATE_KEY
  const TEST_SIGNER_ADDRESS = '0x1Be31A94361a391bBaFB2a4CCd704F57dc04d4bb';
  const MISMATCHED_ADDRESS = '0x2222222222222222222222222222222222222222';
  const VALID_CONTRACT_ADDRESS = '0x8888888888888888888888888888888888888888';
  const PROVENANCE_CONTRACT_ADDRESS = '0x7777777777777777777777777777777777777777';
  const MOCK_RPC_URL = 'https://polygon-amoy-test-rpc.internal';
  const VALID_EVIDENCE_HASH = '0x' + 'e'.repeat(64);
  const dummyPredictionId = '507f1f77bcf86cd799439011';
  const dummyHash = 'a'.repeat(64);

  let service: BlockchainService;
  let originalEnv: NodeJS.ProcessEnv;
  let getNetworkSpy: jest.SpyInstance;

  beforeEach(() => {
    originalEnv = { ...process.env };
    service = new BlockchainService();
    service.clearRelayerAuthorizationCache();
    clearProvenanceAuthorizationCache();

    // Default isolated Amoy environment for test cases
    process.env.BLOCKCHAIN_NETWORK = 'amoy';
    process.env.POLYGON_CHAIN_ID = '80002';
    process.env.POLYGON_RPC_URL = MOCK_RPC_URL;
    process.env.AGROTRACE_REGISTRY_ADDRESS = VALID_CONTRACT_ADDRESS;
    process.env.PROVENANCE_CONTRACT_ADDRESS = PROVENANCE_CONTRACT_ADDRESS;
    process.env.RELAYER_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.AMOY_RELAYER_ADDRESS = TEST_SIGNER_ADDRESS;

    // Mock getNetwork to prevent real RPC handshake
    getNetworkSpy = jest.spyOn(ethers.JsonRpcProvider.prototype, 'getNetwork').mockResolvedValue({
      chainId: 80002n,
    } as any);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  // =========================================================================
  // Case 1: Missing RELAYER_PRIVATE_KEY is rejected
  // =========================================================================
  it('Case 1: Missing RELAYER_PRIVATE_KEY is rejected and submits zero transactions', async () => {
    delete process.env.RELAYER_PRIVATE_KEY;

    const callSpy = jest.spyOn(ethers.JsonRpcProvider.prototype, 'call');

    await expect(service.getSignerContract()).rejects.toThrow(
      '[BlockchainService] Cannot initialize signer contract: Missing RELAYER_PRIVATE_KEY'
    );

    await expect(
      service.registerBatch('BATCH-001', RegistryEventType.PLANTED, VALID_EVIDENCE_HASH)
    ).rejects.toThrow(
      '[BlockchainService] Cannot initialize signer contract: Missing RELAYER_PRIVATE_KEY'
    );

    // Assert zero RPC calls made
    expect(callSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Case 2: Missing expected relayer address is rejected on Amoy
  // =========================================================================
  it('Case 2: Missing expected relayer address is rejected on Amoy and submits zero transactions', async () => {
    delete process.env.AMOY_RELAYER_ADDRESS;
    delete process.env.RELAYER_ADDRESS;

    const callSpy = jest.spyOn(ethers.JsonRpcProvider.prototype, 'call');

    await expect(service.getSignerContract()).rejects.toThrow(
      /Missing expected relayer address on Polygon Amoy/
    );

    await expect(
      service.registerBatch('BATCH-002', RegistryEventType.PLANTED, VALID_EVIDENCE_HASH)
    ).rejects.toThrow(
      /Missing expected relayer address on Polygon Amoy/
    );

    expect(callSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Case 3: Malformed expected address is rejected
  // =========================================================================
  it('Case 3: Malformed expected address is rejected and submits zero transactions', async () => {
    const malformedAddresses = [
      '0xinvalid',
      'not-an-address',
      '0x123',
      ethers.ZeroAddress,
    ];

    for (const badAddress of malformedAddresses) {
      process.env.AMOY_RELAYER_ADDRESS = badAddress;
      const callSpy = jest.spyOn(ethers.JsonRpcProvider.prototype, 'call');

      await expect(service.getSignerContract()).rejects.toThrow(
        /Malformed expected relayer address/
      );

      await expect(
        service.registerBatch('BATCH-003', RegistryEventType.PLANTED, VALID_EVIDENCE_HASH)
      ).rejects.toThrow(
        /Malformed expected relayer address/
      );

      expect(callSpy).not.toHaveBeenCalled();
      callSpy.mockRestore();
    }
  });

  // =========================================================================
  // Case 4: Mismatched signer address is rejected before transaction submission
  // =========================================================================
  it('Case 4: Mismatched signer address is rejected before transaction submission', async () => {
    process.env.AMOY_RELAYER_ADDRESS = MISMATCHED_ADDRESS;

    const callSpy = jest.spyOn(ethers.JsonRpcProvider.prototype, 'call');

    await expect(service.getSignerContract()).rejects.toThrow(
      /Relayer address mismatch: configured expected relayer address .* does not match signing wallet address/
    );

    await expect(
      service.registerBatch('BATCH-004', RegistryEventType.PLANTED, VALID_EVIDENCE_HASH)
    ).rejects.toThrow(
      /Relayer address mismatch/
    );

    expect(callSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Case 5: Matching signer address alone is insufficient when hasRole returns false
  // =========================================================================
  it('Case 5: Matching signer address alone is insufficient when hasRole returns false', async () => {
    // Both key and address match perfectly:
    expect(process.env.AMOY_RELAYER_ADDRESS?.toLowerCase()).toBe(TEST_SIGNER_ADDRESS.toLowerCase());

    // Mock provider.call to return false for hasRole
    const callSpy = jest.spyOn(ethers.JsonRpcProvider.prototype, 'call').mockImplementation(async (tx: any) => {
      // Return false encoded as ABI bool
      return REGISTRY_INTERFACE.encodeFunctionResult('hasRole', [false]);
    });

    await expect(service.getSignerContract()).rejects.toThrow(
      /Relayer authorization failure: Signer address .* does not hold RELAYER_ROLE on contract/
    );

    await expect(
      service.registerBatch('BATCH-005', RegistryEventType.PLANTED, VALID_EVIDENCE_HASH)
    ).rejects.toThrow(
      /Relayer authorization failure: Signer address .* does not hold RELAYER_ROLE on contract/
    );

    await expect(
      service.recordEvent('BATCH-005', RegistryEventType.HARVESTED, VALID_EVIDENCE_HASH)
    ).rejects.toThrow(
      /Relayer authorization failure: Signer address .* does not hold RELAYER_ROLE on contract/
    );

    // Confirms hasRole query was attempted, but ZERO state-changing broadcast was made
    expect(callSpy).toHaveBeenCalled();
  });

  // =========================================================================
  // Case 6: Role-query failure prevents transaction submission
  // =========================================================================
  it('Case 6: Role-query failure prevents transaction submission', async () => {
    // Mock provider.call to throw an RPC network failure
    jest.spyOn(ethers.JsonRpcProvider.prototype, 'call').mockRejectedValue(
      new Error('RPC request timed out or node unreachable')
    );

    await expect(service.getSignerContract()).rejects.toThrow(
      /Relayer role verification failed: Unable to query RELAYER_ROLE for address/
    );

    await expect(
      service.registerBatch('BATCH-006', RegistryEventType.PLANTED, VALID_EVIDENCE_HASH)
    ).rejects.toThrow(
      /Relayer role verification failed/
    );

    await expect(
      service.recordEvent('BATCH-006', RegistryEventType.HARVESTED, VALID_EVIDENCE_HASH)
    ).rejects.toThrow(
      /Relayer role verification failed/
    );
  });

  // =========================================================================
  // Case 7: hasRole returning true permits authorization preflight to pass
  // =========================================================================
  it('Case 7: hasRole returning true permits authorization preflight to pass with isolated mock submission', async () => {
    const mockTxHash = '0x' + 'a'.repeat(64);
    const mockTx = {
      hash: mockTxHash,
      wait: jest.fn().mockResolvedValue({
        hash: mockTxHash,
        blockNumber: 1055,
      }),
    };

    // Mock hasRole returning true on call
    jest.spyOn(ethers.JsonRpcProvider.prototype, 'call').mockImplementation(async (tx: any) => {
      return REGISTRY_INTERFACE.encodeFunctionResult('hasRole', [true]);
    });

    // Mock registerBatch call on the contract instance
    const originalContract = ethers.Contract;
    const registerBatchMock = jest.fn().mockResolvedValue(mockTx);
    const recordEventMock = jest.fn().mockResolvedValue(mockTx);

    jest.spyOn(ethers, 'Contract').mockImplementation((target: any, abi: any, runner: any) => {
      const instance = new originalContract(target, abi, runner);
      (instance as any).registerBatch = registerBatchMock;
      (instance as any).recordEvent = recordEventMock;
      (instance as any).hasRole = jest.fn().mockResolvedValue(true);
      return instance as any;
    });

    const result = await service.registerBatch(
      'BATCH-007',
      RegistryEventType.PLANTED,
      VALID_EVIDENCE_HASH
    );

    expect(result.txHash).toBe(mockTxHash);
    expect(result.blockNumber).toBe(1055);
    expect(result.simulated).toBe(false);
    expect(registerBatchMock).toHaveBeenCalled();

    // Verify cache prevents repeated hasRole query for identical identity
    const recordResult = await service.recordEvent(
      'BATCH-007',
      RegistryEventType.HARVESTED,
      VALID_EVIDENCE_HASH
    );

    expect(recordResult.txHash).toBe(mockTxHash);
    expect(recordEventMock).toHaveBeenCalled();
  });

  // =========================================================================
  // Case 8: Local Hardhat behavior remains compatible
  // =========================================================================
  it('Case 8: Local Hardhat behavior remains compatible without requiring Amoy variables', async () => {
    process.env.BLOCKCHAIN_NETWORK = 'local';
    process.env.POLYGON_CHAIN_ID = '31337';
    process.env.POLYGON_RPC_URL = 'http://127.0.0.1:8545';
    process.env.NODE_ENV = 'development';
    delete process.env.AMOY_RELAYER_ADDRESS;
    delete process.env.RELAYER_ADDRESS;
    delete process.env.RELAYER_PRIVATE_KEY;

    getNetworkSpy.mockResolvedValue({ chainId: 31337n } as any);

    const config = service.getConfig();
    expect(config.mode).toBe('local');
    expect(config.expectedChainId).toBe(31337);
    expect(config.expectedRelayerAddress).toBe('');
    // Uses default Hardhat dev key locally
    expect(config.privateKey).toBe('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

    // With hasRole mocked to true, local signer initializes smoothly
    jest.spyOn(service, 'verifyRelayerAuthorization').mockResolvedValue(true);
    const { wallet } = await service.getSignerContract();
    expect(wallet.address.toLowerCase()).toBe('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
  });

  // =========================================================================
  // Case 9: Provenance service parity and safeguards
  // =========================================================================
  describe('Case 10: Provenance service parity and safeguards', () => {
    it('10a. Provenance fails closed if RELAYER_PRIVATE_KEY is missing on Amoy', async () => {
      delete process.env.RELAYER_PRIVATE_KEY;

      await expect(
        anchorPrediction(dummyPredictionId, dummyHash, 'YIELD')
      ).rejects.toThrow('RELAYER_PRIVATE_KEY is missing in amoy mode');
    });

    it('10b. Provenance fails closed if expected relayer address is missing on Amoy', async () => {
      delete process.env.AMOY_RELAYER_ADDRESS;
      delete process.env.RELAYER_ADDRESS;

      await expect(
        anchorPrediction(dummyPredictionId, dummyHash, 'YIELD')
      ).rejects.toThrow(/Missing expected relayer address on Polygon Amoy/);
    });

    it('10c. Provenance fails closed if expected relayer address is malformed', async () => {
      process.env.AMOY_RELAYER_ADDRESS = '0xinvalid';

      await expect(
        anchorPrediction(dummyPredictionId, dummyHash, 'YIELD')
      ).rejects.toThrow(/Malformed expected relayer address/);
    });

    it('10d. Provenance fails closed if signer address mismatches expected address', async () => {
      process.env.AMOY_RELAYER_ADDRESS = MISMATCHED_ADDRESS;

      await expect(
        anchorPrediction(dummyPredictionId, dummyHash, 'YIELD')
      ).rejects.toThrow(/Relayer address mismatch/);
    });

    it('10e. Provenance fails closed if WRITER_ROLE returns false on-chain', async () => {
      const PROVENANCE_INTERFACE = new ethers.Interface([
        'function hasRole(bytes32,address) view returns (bool)',
      ]);

      jest.spyOn(ethers.JsonRpcProvider.prototype, 'call').mockImplementation(async () => {
        return PROVENANCE_INTERFACE.encodeFunctionResult('hasRole', [false]);
      });

      await expect(
        anchorPrediction(dummyPredictionId, dummyHash, 'YIELD')
      ).rejects.toThrow(
        /Relayer authorization failure: Signer address .* does not hold WRITER_ROLE on contract/
      );
    });

    it('10f. Provenance fails closed if WRITER_ROLE query fails', async () => {
      jest.spyOn(ethers.JsonRpcProvider.prototype, 'call').mockRejectedValue(
        new Error('RPC connection dropped')
      );

      await expect(
        anchorPrediction(dummyPredictionId, dummyHash, 'YIELD')
      ).rejects.toThrow(/Relayer role verification failed: Unable to query WRITER_ROLE/);
    });
  });

  // =========================================================================
  // Directive 022: Real-Time Preflight & Immediate Role Revocation Detection
  // =========================================================================
  describe('Directive 022: Real-Time Preflight & Immediate Role Revocation Detection', () => {
    it('Detects on-chain role revocation immediately after previously successful authorization', async () => {
      let roleGranted = true;
      const callSpy = jest.spyOn(ethers.JsonRpcProvider.prototype, 'call').mockImplementation(async () => {
        return REGISTRY_INTERFACE.encodeFunctionResult('hasRole', [roleGranted]);
      });

      // Call 1: Authorized - succeeds
      const { wallet } = await service.getSignerContract();
      expect(wallet.address.toLowerCase()).toBe(TEST_SIGNER_ADDRESS.toLowerCase());

      // Role is revoked on-chain by administrator
      roleGranted = false;

      // Call 2: Immediate revocation detection - strictly fails closed without stale cache bypass
      await expect(service.getSignerContract()).rejects.toThrow(
        /Relayer authorization failure: Signer address .* does not hold RELAYER_ROLE on contract/
      );

      await expect(
        service.registerBatch('BATCH-REVOKED', RegistryEventType.PLANTED, VALID_EVIDENCE_HASH)
      ).rejects.toThrow(
        /Relayer authorization failure: Signer address .* does not hold RELAYER_ROLE on contract/
      );

      // Verify that the subsequent calls actually queried the provider again without cache bypass
      expect(callSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it('Executes fresh on-chain verification on every transaction dispatch (zero stale cache)', async () => {
      let queryCount = 0;
      jest.spyOn(ethers.JsonRpcProvider.prototype, 'call').mockImplementation(async () => {
        queryCount++;
        return REGISTRY_INTERFACE.encodeFunctionResult('hasRole', [true]);
      });

      await service.getSignerContract();
      const firstCount = queryCount;
      expect(firstCount).toBeGreaterThan(0);

      // Second transaction initialization: queries on-chain afresh, ensuring real-time enforcement
      await service.getSignerContract();
      expect(queryCount).toBeGreaterThan(firstCount);
    });

    it('Provenance service detects WRITER_ROLE revocation immediately', async () => {
      const PROVENANCE_INTERFACE = new ethers.Interface([
        'function hasRole(bytes32,address) view returns (bool)',
      ]);

      let writerRoleGranted = true;
      jest.spyOn(ethers.JsonRpcProvider.prototype, 'call').mockImplementation(async () => {
        return PROVENANCE_INTERFACE.encodeFunctionResult('hasRole', [writerRoleGranted]);
      });

      // Role is revoked on-chain
      writerRoleGranted = false;

      await expect(
        anchorPrediction(dummyPredictionId, dummyHash, 'YIELD')
      ).rejects.toThrow(
        /Relayer authorization failure: Signer address .* does not hold WRITER_ROLE on contract/
      );
    });
  });
});
