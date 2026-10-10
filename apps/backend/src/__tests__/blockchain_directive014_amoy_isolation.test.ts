import { BlockchainService } from '../services/blockchain.service';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

describe('Directive 014: Polygon Amoy Network & Address Isolation Tests', () => {
  let service: BlockchainService;
  const envBackup: NodeJS.ProcessEnv = { ...process.env };

  beforeEach(() => {
    service = new BlockchainService();
    // Reset process.env to pristine baseline before each test
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envBackup);
  });

  afterAll(() => {
    // Final restoration of process.env
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envBackup);
  });

  // -------------------------------------------------------------------------
  // Test 1: Reject local Hardhat contract address on Polygon Amoy
  // -------------------------------------------------------------------------
  it('1. Rejects local Hardhat contract address (0x5FbDB2315678afecb367f032d93F642f64180aa3) on Polygon Amoy', () => {
    process.env.BLOCKCHAIN_NETWORK = 'amoy';
    process.env.POLYGON_CHAIN_ID = '80002';
    process.env.POLYGON_RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com';
    process.env.AGROTRACE_REGISTRY_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

    expect(() => service.getConfig()).toThrow(
      /Local Hardhat contract address .* cannot be used on Polygon Amoy/
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: Reject localhost RPC URL on Polygon Amoy
  // -------------------------------------------------------------------------
  it('2. Rejects localhost RPC URL (127.0.0.1 / localhost) on Polygon Amoy network', () => {
    process.env.BLOCKCHAIN_NETWORK = 'amoy';
    process.env.POLYGON_CHAIN_ID = '80002';
    process.env.POLYGON_RPC_URL = 'http://127.0.0.1:8545';
    process.env.AGROTRACE_REGISTRY_ADDRESS = '0x1111111111111111111111111111111111111111';

    expect(() => service.getConfig()).toThrow(
      /Localhost RPC URL .* cannot be used with Polygon Amoy/
    );
  });

  // -------------------------------------------------------------------------
  // Test 3: Reject Hardhat development private key on Polygon Amoy
  // -------------------------------------------------------------------------
  it('3. Rejects Hardhat development private key on Polygon Amoy during signer initialization', async () => {
    process.env.BLOCKCHAIN_NETWORK = 'amoy';
    process.env.POLYGON_CHAIN_ID = '80002';
    process.env.POLYGON_RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com';
    process.env.AGROTRACE_REGISTRY_ADDRESS = '0x1111111111111111111111111111111111111111';
    process.env.RELAYER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

    await expect(service.getSignerContract()).rejects.toThrow(
      /Hardhat development private key is strictly prohibited on Polygon Amoy/
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: Reject inconsistent network name and chain ID combination
  // -------------------------------------------------------------------------
  it('4. Rejects inconsistent network name and chain ID combination', () => {
    // amoy with local chainId 31337
    process.env.BLOCKCHAIN_NETWORK = 'amoy';
    process.env.POLYGON_CHAIN_ID = '31337';
    expect(() => service.getConfig()).toThrow(/requires chain ID 80002/);

    // local with amoy chainId 80002
    process.env.BLOCKCHAIN_NETWORK = 'local';
    process.env.POLYGON_CHAIN_ID = '80002';
    expect(() => service.getConfig()).toThrow(/Local network configuration cannot use Polygon Amoy chain ID 80002/);
  });

  // -------------------------------------------------------------------------
  // Test 5: contract-address.json does not leak local address to Amoy
  // -------------------------------------------------------------------------
  it('5. Does not fall back to root local address in contract-address.json when running under Amoy mode', () => {
    process.env.BLOCKCHAIN_NETWORK = 'amoy';
    process.env.POLYGON_CHAIN_ID = '80002';
    process.env.POLYGON_RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com';
    delete process.env.AGROTRACE_REGISTRY_ADDRESS;
    delete process.env.TRACEABILITY_CONTRACT_ADDRESS;

    const config = service.getConfig();
    // contractAddress must fail closed to empty string (or network-scoped 80002 address if present)
    // and must never equal the local address
    expect(config.contractAddress).not.toBe('0x5FbDB2315678afecb367f032d93F642f64180aa3');
    expect(config.contractAddress).not.toBe('0x46b142DD1E924FAb83eCc3c08e4D46E82f005e0E');
  });

  // -------------------------------------------------------------------------
  // Test 6: Zero-address placeholder is treated as unconfigured
  // -------------------------------------------------------------------------
  it('6. Treats 0x0000000000000000000000000000000000000000 as unconfigured placeholder', async () => {
    process.env.BLOCKCHAIN_NETWORK = 'amoy';
    process.env.POLYGON_CHAIN_ID = '80002';
    process.env.POLYGON_RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com';
    process.env.AGROTRACE_REGISTRY_ADDRESS = '0x0000000000000000000000000000000000000000';

    await expect(service.getReadOnlyContract()).rejects.toThrow(
      /Missing AGROTRACE_REGISTRY_ADDRESS/
    );
  });

  // -------------------------------------------------------------------------
  // Test 7: Legitimate Amoy configuration is accepted
  // -------------------------------------------------------------------------
  it('7. Accepts valid, isolated Polygon Amoy configuration without error', () => {
    process.env.BLOCKCHAIN_NETWORK = 'amoy';
    process.env.POLYGON_CHAIN_ID = '80002';
    process.env.POLYGON_RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com';
    process.env.AGROTRACE_REGISTRY_ADDRESS = '0x8888888888888888888888888888888888888888';
    process.env.RELAYER_PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    const config = service.getConfig();
    expect(config.mode).toBe('amoy');
    expect(config.expectedChainId).toBe(80002);
    expect(config.rpcUrl).toBe('https://polygon-amoy-bor-rpc.publicnode.com');
    expect(config.contractAddress).toBe('0x8888888888888888888888888888888888888888');
    expect(config.privateKey).toBe('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
  });

  // -------------------------------------------------------------------------
  // Test 8: Reading Amoy address from network-keyed contract-address.json
  // -------------------------------------------------------------------------
  it('8. Successfully reads Amoy address when explicitly registered under 80002 in contract-address.json', () => {
    process.env.BLOCKCHAIN_NETWORK = 'amoy';
    process.env.POLYGON_CHAIN_ID = '80002';
    process.env.POLYGON_RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com';
    delete process.env.AGROTRACE_REGISTRY_ADDRESS;
    delete process.env.TRACEABILITY_CONTRACT_ADDRESS;

    const addressPath = path.join(__dirname, '../../../../blockchain/contract-address.json');
    const originalContent = fs.readFileSync(addressPath, 'utf8');

    try {
      const mockData = JSON.parse(originalContent);
      mockData['80002'] = {
        network: 'amoy',
        chainId: 80002,
        AgroTraceRegistry: '0x9999999999999999999999999999999999999999',
      };
      fs.writeFileSync(addressPath, JSON.stringify(mockData, null, 2));

      const config = service.getConfig();
      expect(config.contractAddress).toBe('0x9999999999999999999999999999999999999999');
    } finally {
      fs.writeFileSync(addressPath, originalContent);
    }
  });

  // -------------------------------------------------------------------------
  // Test 9: Fails closed when attempting to initialize Amoy signer with no key
  // -------------------------------------------------------------------------
  it('9. Strictly fails closed when initializing Amoy signer with missing relayer key', async () => {
    process.env.BLOCKCHAIN_NETWORK = 'amoy';
    process.env.POLYGON_CHAIN_ID = '80002';
    process.env.POLYGON_RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com';
    process.env.AGROTRACE_REGISTRY_ADDRESS = '0x8888888888888888888888888888888888888888';
    delete process.env.RELAYER_PRIVATE_KEY;
    delete process.env.CONTRACT_OWNER_PRIVATE_KEY;

    await expect(service.getSignerContract()).rejects.toThrow(
      /Missing RELAYER_PRIVATE_KEY/
    );
  });

  // -------------------------------------------------------------------------
  // Test 10: CONTRACT_OWNER_PRIVATE_KEY alone CANNOT initialize Amoy signer
  // -------------------------------------------------------------------------
  it('10. CONTRACT_OWNER_PRIVATE_KEY alone cannot initialize Amoy signer (fails closed)', async () => {
    process.env.BLOCKCHAIN_NETWORK = 'amoy';
    process.env.POLYGON_CHAIN_ID = '80002';
    process.env.POLYGON_RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com';
    process.env.AGROTRACE_REGISTRY_ADDRESS = '0x8888888888888888888888888888888888888888';
    delete process.env.RELAYER_PRIVATE_KEY;
    process.env.CONTRACT_OWNER_PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    // Must fail closed because CONTRACT_OWNER_PRIVATE_KEY fallback has been removed for runtime
    await expect(service.getSignerContract()).rejects.toThrow(
      /Missing RELAYER_PRIVATE_KEY/
    );
  });

  // -------------------------------------------------------------------------
  // Test 11: Selects canonical RELAYER_PRIVATE_KEY and matches relayer address
  // -------------------------------------------------------------------------
  it('11. Accepts canonical RELAYER_PRIVATE_KEY when valid configuration is provided', async () => {
    process.env.BLOCKCHAIN_NETWORK = 'amoy';
    process.env.POLYGON_CHAIN_ID = '80002';
    process.env.POLYGON_RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com';
    process.env.AGROTRACE_REGISTRY_ADDRESS = '0x8888888888888888888888888888888888888888';
    process.env.RELAYER_PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    // 0x1234... maps to 0x1Be31A94361a391bBaFB2a4CCd704F57dc04d4bb
    process.env.AMOY_RELAYER_ADDRESS = '0x1Be31A94361a391bBaFB2a4CCd704F57dc04d4bb';

    const getNetworkSpy = jest.spyOn(ethers.JsonRpcProvider.prototype, 'getNetwork').mockResolvedValue({
      chainId: 80002n,
    } as any);
    const authSpy = jest.spyOn(service, 'verifyRelayerAuthorization').mockResolvedValue(true);

    try {
      const { wallet } = await service.getSignerContract();
      expect(wallet.address.toLowerCase()).toBe('0x1be31a94361a391bbafb2a4ccd704f57dc04d4bb');
      expect(authSpy).toHaveBeenCalled();
    } finally {
      getNetworkSpy.mockRestore();
      authSpy.mockRestore();
    }
  });

  // -------------------------------------------------------------------------
  // Test 12: Rejects configured relayer address mismatch
  // -------------------------------------------------------------------------
  it('12. Rejects configured relayer address mismatch before submitting state-changing transaction', async () => {
    process.env.BLOCKCHAIN_NETWORK = 'amoy';
    process.env.POLYGON_CHAIN_ID = '80002';
    process.env.POLYGON_RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com';
    process.env.AGROTRACE_REGISTRY_ADDRESS = '0x8888888888888888888888888888888888888888';
    process.env.RELAYER_PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    // Mismatched expected address:
    process.env.AMOY_RELAYER_ADDRESS = '0x9999999999999999999999999999999999999999';

    const getNetworkSpy = jest.spyOn(ethers.JsonRpcProvider.prototype, 'getNetwork').mockResolvedValue({
      chainId: 80002n,
    } as any);

    try {
      await expect(service.getSignerContract()).rejects.toThrow(
        /Relayer address mismatch: configured expected relayer address .* does not match signing wallet address/
      );
    } finally {
      getNetworkSpy.mockRestore();
    }
  });

  // -------------------------------------------------------------------------
  // Test 13: Local development mode remains compatible with safety requirements
  // -------------------------------------------------------------------------
  it('13. Local development mode uses default key only under strict local conditions', () => {
    process.env.BLOCKCHAIN_NETWORK = 'local';
    process.env.POLYGON_CHAIN_ID = '31337';
    process.env.POLYGON_RPC_URL = 'http://127.0.0.1:8545';
    process.env.NODE_ENV = 'development';
    delete process.env.RELAYER_PRIVATE_KEY;
    delete process.env.CONTRACT_OWNER_PRIVATE_KEY;

    const config = service.getConfig();
    expect(config.mode).toBe('local');
    expect(config.privateKey).toBe('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  });
});
