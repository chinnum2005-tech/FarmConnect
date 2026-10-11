import { ethers } from 'ethers';
import {
  startProvenanceListener,
  stopProvenanceListener,
  resolveRpcUrl,
  resolveContractAddress,
  getNetworkMode,
  isLocalhostRpc,
  sanitizeRpcUrl,
  handlePredictionAnchoredEvent,
  KNOWN_LOCAL_HARDHAT_ADDRESSES,
} from '../services/provenanceListener';

// Mock Prisma client to keep tests strictly offline with zero DB connection
jest.mock('../database/prisma', () => ({
  __esModule: true,
  default: {
    yieldPrediction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    cropRecommendation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    provenanceRecord: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  },
}));

describe('Directive 042: Provenance Listener Configuration & Verifiability Tests', () => {
  const envBackup: NodeJS.ProcessEnv = { ...process.env };

  const VALID_AMOY_RPC = 'https://polygon-amoy-bor-rpc.publicnode.com';
  const VALID_AMOY_CONTRACT = '0x1111111111111111111111111111111111111111';

  beforeEach(() => {
    // Reset process.env to clean state
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envBackup);

    // Clean blockchain-related env vars for deterministic isolation
    delete process.env.BLOCKCHAIN_NETWORK;
    delete process.env.POLYGON_RPC_URL;
    delete process.env.RPC_URL;
    delete process.env.POLYGON_CHAIN_ID;
    delete process.env.CHAIN_ID;
    delete process.env.PROVENANCE_CONTRACT_ADDRESS;
    delete process.env.PREDICTION_PROVENANCE_ADDRESS;

    stopProvenanceListener();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    stopProvenanceListener();
  });

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envBackup);
    stopProvenanceListener();
  });

  // =========================================================================
  // 1. Production with no RPC configured
  // =========================================================================
  describe('1. Production with no RPC configured', () => {
    it('safely skips listener initialization and never defaults to localhost in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PROVENANCE_CONTRACT_ADDRESS = VALID_AMOY_CONTRACT;

      const rpcResult = resolveRpcUrl('amoy', true);
      expect(rpcResult.rpcUrl).toBeNull();
      expect(rpcResult.error).toMatch(/RPC_URL \/ POLYGON_RPC_URL not configured/i);

      const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const started = await startProvenanceListener();

      expect(started).toBe(false);
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringMatching(/RPC_URL \/ POLYGON_RPC_URL not configured\. PredictionProvenance listener safely skipped\./)
      );
    });

    it('honours POLYGON_RPC_URL as priority over RPC_URL in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.RPC_URL = 'https://fallback-rpc.example.com';
      process.env.POLYGON_RPC_URL = 'https://priority-polygon-rpc.example.com';

      const rpcResult = resolveRpcUrl('amoy', true);
      expect(rpcResult.rpcUrl).toBe('https://priority-polygon-rpc.example.com');
    });
  });

  // =========================================================================
  // 2. Local development with a local RPC
  // =========================================================================
  describe('2. Local development with local RPC', () => {
    it('uses localhost RPC in local mode and successfully initializes with mocked local node', async () => {
      process.env.NODE_ENV = 'development';
      process.env.BLOCKCHAIN_NETWORK = 'local';

      const rpcResult = resolveRpcUrl('local', false);
      expect(rpcResult.rpcUrl).toBe('http://127.0.0.1:8545');

      const addrResult = resolveContractAddress('local', false);
      expect(addrResult.address).toBeTruthy();
      expect(ethers.isAddress(addrResult.address!)).toBe(true);

      // Mock ethers provider getNetwork to simulate responsive local Hardhat node
      jest.spyOn(ethers.JsonRpcProvider.prototype, 'getNetwork').mockResolvedValue({
        chainId: BigInt(31337),
        name: 'unknown',
      } as any);

      const contractOnSpy = jest.spyOn(ethers.Contract.prototype, 'on').mockImplementation((() => {}) as any);

      const started = await startProvenanceListener();
      expect(started).toBe(true);
      expect(contractOnSpy).toHaveBeenCalledWith('PredictionAnchored', expect.any(Function));
    });
  });

  // =========================================================================
  // 3. Amoy configuration with a localhost RPC
  // =========================================================================
  describe('3. Amoy configuration with localhost RPC', () => {
    it('rejects http://localhost:8545 when configured for Polygon Amoy', async () => {
      process.env.BLOCKCHAIN_NETWORK = 'amoy';
      process.env.RPC_URL = 'http://localhost:8545';
      process.env.PROVENANCE_CONTRACT_ADDRESS = VALID_AMOY_CONTRACT;

      const rpcResult = resolveRpcUrl('amoy', false);
      expect(rpcResult.rpcUrl).toBeNull();
      expect(rpcResult.error).toMatch(/Localhost RPC URL .* cannot be used with Polygon Amoy/i);

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const started = await startProvenanceListener();

      expect(started).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Localhost RPC URL .* cannot be used with Polygon Amoy/i)
      );
    });

    it('rejects http://127.0.0.1:8545 when configured for Polygon Amoy', async () => {
      process.env.BLOCKCHAIN_NETWORK = 'amoy';
      process.env.POLYGON_RPC_URL = 'http://127.0.0.1:8545';
      process.env.PROVENANCE_CONTRACT_ADDRESS = VALID_AMOY_CONTRACT;

      const rpcResult = resolveRpcUrl('amoy', false);
      expect(rpcResult.rpcUrl).toBeNull();
      expect(rpcResult.error).toMatch(/Localhost RPC URL/i);

      const started = await startProvenanceListener();
      expect(started).toBe(false);
    });
  });

  // =========================================================================
  // 4. Missing or invalid contract address
  // =========================================================================
  describe('4. Missing or invalid contract address', () => {
    it('safely skips listener when contract address is missing on Amoy', async () => {
      process.env.BLOCKCHAIN_NETWORK = 'amoy';
      process.env.POLYGON_RPC_URL = VALID_AMOY_RPC;
      delete process.env.PROVENANCE_CONTRACT_ADDRESS;

      const addrResult = resolveContractAddress('amoy', false);
      expect(addrResult.address).toBeNull();
      expect(addrResult.error).toMatch(/PROVENANCE_CONTRACT_ADDRESS not configured/i);

      const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const started = await startProvenanceListener();

      expect(started).toBe(false);
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringMatching(/PROVENANCE_CONTRACT_ADDRESS not configured/)
      );
    });

    it('safely skips listener when contract address is zero address placeholder', async () => {
      process.env.BLOCKCHAIN_NETWORK = 'amoy';
      process.env.POLYGON_RPC_URL = VALID_AMOY_RPC;
      process.env.PROVENANCE_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';

      const addrResult = resolveContractAddress('amoy', false);
      expect(addrResult.address).toBeNull();

      const started = await startProvenanceListener();
      expect(started).toBe(false);
    });

    it('rejects invalid hex / malformed contract address', async () => {
      process.env.BLOCKCHAIN_NETWORK = 'amoy';
      process.env.POLYGON_RPC_URL = VALID_AMOY_RPC;
      process.env.PROVENANCE_CONTRACT_ADDRESS = 'not-a-valid-ethereum-address';

      const addrResult = resolveContractAddress('amoy', false);
      expect(addrResult.address).toBeNull();
      expect(addrResult.error).toMatch(/Invalid contract address format/i);

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const started = await startProvenanceListener();

      expect(started).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Invalid contract address format/)
      );
    });
  });

  // =========================================================================
  // 5. Local Hardhat address incorrectly configured for Amoy
  // =========================================================================
  describe('5. Local Hardhat address incorrectly configured for Amoy', () => {
    it.each(KNOWN_LOCAL_HARDHAT_ADDRESSES)(
      'rejects known local Hardhat address %s on Polygon Amoy',
      async (localAddress) => {
        process.env.BLOCKCHAIN_NETWORK = 'amoy';
        process.env.POLYGON_RPC_URL = VALID_AMOY_RPC;
        process.env.PROVENANCE_CONTRACT_ADDRESS = localAddress;

        const addrResult = resolveContractAddress('amoy', false);
        expect(addrResult.address).toBeNull();
        expect(addrResult.error).toMatch(/Inconsistent configuration: Local Hardhat deployment address/i);

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const started = await startProvenanceListener();

        expect(started).toBe(false);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringMatching(/Local Hardhat deployment address .* cannot be used on Polygon Amoy/)
        );
      }
    );
  });

  // =========================================================================
  // 6. Valid production configuration
  // =========================================================================
  describe('6. Valid production configuration', () => {
    it('successfully starts listener when production RPC and contract address are properly configured', async () => {
      process.env.NODE_ENV = 'production';
      process.env.BLOCKCHAIN_NETWORK = 'amoy';
      process.env.POLYGON_RPC_URL = VALID_AMOY_RPC;
      process.env.PROVENANCE_CONTRACT_ADDRESS = VALID_AMOY_CONTRACT;

      // Mock ethers provider getNetwork returning chainId 80002
      jest.spyOn(ethers.JsonRpcProvider.prototype, 'getNetwork').mockResolvedValue({
        chainId: BigInt(80002),
        name: 'polygon-amoy',
      } as any);

      const contractOnSpy = jest.spyOn(ethers.Contract.prototype, 'on').mockImplementation((() => {}) as any);

      const started = await startProvenanceListener();
      expect(started).toBe(true);
      expect(contractOnSpy).toHaveBeenCalledWith('PredictionAnchored', expect.any(Function));
    });
  });

  // =========================================================================
  // 7. Listener startup and failure handling
  // =========================================================================
  describe('7. Listener startup and failure handling', () => {
    it('gracefully handles unreachable RPC endpoint during startup without crashing process', async () => {
      process.env.NODE_ENV = 'production';
      process.env.BLOCKCHAIN_NETWORK = 'amoy';
      process.env.POLYGON_RPC_URL = VALID_AMOY_RPC;
      process.env.PROVENANCE_CONTRACT_ADDRESS = VALID_AMOY_CONTRACT;

      // Simulate network connection failure (ECONNREFUSED / timeout)
      jest.spyOn(ethers.JsonRpcProvider.prototype, 'getNetwork').mockRejectedValue(
        new Error('connect ECONNREFUSED 10.0.0.1:8545')
      );
      const destroySpy = jest.spyOn(ethers.JsonRpcProvider.prototype, 'destroy').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const started = await startProvenanceListener();

      expect(started).toBe(false);
      expect(destroySpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to connect to RPC endpoint .* Listener safely disabled\./)
      );
    });

    it('rejects connection if connected RPC returns incorrect chainId on Amoy', async () => {
      process.env.BLOCKCHAIN_NETWORK = 'amoy';
      process.env.POLYGON_RPC_URL = VALID_AMOY_RPC;
      process.env.PROVENANCE_CONTRACT_ADDRESS = VALID_AMOY_CONTRACT;

      // Simulate connected node returning Ethereum Mainnet (chainId 1) instead of Amoy (80002)
      jest.spyOn(ethers.JsonRpcProvider.prototype, 'getNetwork').mockResolvedValue({
        chainId: BigInt(1),
        name: 'mainnet',
      } as any);
      const destroySpy = jest.spyOn(ethers.JsonRpcProvider.prototype, 'destroy').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const started = await startProvenanceListener();

      expect(started).toBe(false);
      expect(destroySpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Chain ID mismatch: connected network has chainId 1, expected 80002 for Polygon Amoy/)
      );
    });

    it('sanitizes sensitive tokens, passwords, and API keys from logged RPC URLs', () => {
      const urlWithKey = 'https://polygon-amoy.g.alchemy.com/v2/abcdef1234567890abcdef1234567890';
      const sanitized = sanitizeRpcUrl(urlWithKey);
      expect(sanitized).not.toContain('abcdef1234567890abcdef1234567890');
      expect(sanitized).toContain('abcd...7890');

      const urlWithAuth = 'https://user:secretpassword@amoy-rpc.example.com/v1';
      const sanitizedAuth = sanitizeRpcUrl(urlWithAuth);
      expect(sanitizedAuth).not.toContain('secretpassword');
      expect(sanitizedAuth).toContain('***');

      const urlWithQuery = 'https://amoy-rpc.example.com?apiKey=very-secret-token-1234';
      const sanitizedQuery = sanitizeRpcUrl(urlWithQuery);
      expect(sanitizedQuery).not.toContain('very-secret-token-1234');
      expect(sanitizedQuery).toContain('apiKey=***');
    });

    it('successfully handles and decodes PredictionAnchored event payload', async () => {
      const prismaMock = require('../database/prisma').default;
      const testUuid = '12345678-1234-1234-1234-1234567890ab';
      const cleanHex = testUuid.replace(/-/g, '');
      const predictionIdBytes = '0x' + cleanHex.padEnd(64, '0');
      const hashBytes = '0x' + 'f'.repeat(64);
      const txHash = '0xabc123';

      const decodedUuid = await handlePredictionAnchoredEvent(
        predictionIdBytes,
        hashBytes,
        0, // YIELD
        BigInt(1001),
        txHash
      );

      expect(decodedUuid).toBe(testUuid);
      expect(prismaMock.provenanceRecord.updateMany).toHaveBeenCalledWith({
        where: { predictionId: testUuid },
        data: expect.objectContaining({
          txHash,
          blockNumber: 1001,
        }),
      });
      expect(prismaMock.yieldPrediction.updateMany).toHaveBeenCalledWith({
        where: { id: testUuid },
        data: {
          provenanceStatus: 'CONFIRMED',
          txHash,
        },
      });
    });
  });
});
