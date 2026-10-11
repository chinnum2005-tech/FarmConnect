import { ethers } from 'ethers';
const { runProvenanceDeployment, KNOWN_DEV_ACCOUNTS } = require('../../../../services/blockchain/scripts/deploy-provenance');
import { anchorPrediction, WRITER_ROLE_HASH } from '../services/provenance.service';

// Mock Prisma client to keep tests strictly offline with zero DB connection timeouts
jest.mock('../database/prisma', () => ({
  __esModule: true,
  default: {
    yieldPrediction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    cropRecommendation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    provenanceRecord: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  },
}));

describe('Directive 023: PredictionProvenance Amoy Deployment Safety Gate & Isolation Tests', () => {
  const envBackup: NodeJS.ProcessEnv = { ...process.env };

  const VALID_AMOY_DEPLOYER = '0x1111111111111111111111111111111111111111';
  const VALID_AMOY_ADMIN = '0x2222222222222222222222222222222222222222';
  const VALID_AMOY_RELAYER = '0x3333333333333333333333333333333333333333';

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envBackup);
    delete process.env.DEPLOY_CONFIRM;
    delete process.env.AMOY_ADMIN_ADDRESS;
    delete process.env.AMOY_RELAYER_ADDRESS;
  });

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envBackup);
  });

  // Helper to create offline mock HRE
  function createMockHre(options: {
    chainId: number;
    networkName: string;
    signers?: Array<{ address: string }>;
    deployFn?: jest.Mock;
    getDeployTxFn?: jest.Mock;
  }) {
    const { chainId, networkName, signers = [], deployFn = jest.fn(), getDeployTxFn = jest.fn() } = options;

    return {
      network: {
        name: networkName,
      },
      ethers: {
        ZeroAddress: '0x0000000000000000000000000000000000000000',
        isAddress: (addr: string) => /^0x[0-9a-fA-F]{40}$/.test(addr),
        provider: {
          getNetwork: jest.fn().mockResolvedValue({ chainId: BigInt(chainId) }),
        },
        getSigners: jest.fn().mockResolvedValue(signers),
        getContractFactory: jest.fn().mockResolvedValue({
          getDeployTransaction: getDeployTxFn.mockResolvedValue({
            data: '0x608060405234801561001057600080fd5b50', // Mock encoded bytecode
          }),
          deploy: deployFn,
        }),
      },
    };
  }

  // 1. Missing deployment key / signer is rejected
  it('1. Rejects execution if no deployment signer is configured on Amoy', async () => {
    const mockHre = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [], // No signers configured
    });

    process.env.AMOY_ADMIN_ADDRESS = VALID_AMOY_ADMIN;
    process.env.AMOY_RELAYER_ADDRESS = VALID_AMOY_RELAYER;

    await expect(runProvenanceDeployment(mockHre)).rejects.toThrow(
      /No deployment signer configured for network "amoy"/
    );
  });

  // 2. Missing admin or relayer address rejected
  it('2. Rejects execution if AMOY_ADMIN_ADDRESS or AMOY_RELAYER_ADDRESS is missing on Amoy', async () => {
    const mockHre = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [{ address: VALID_AMOY_DEPLOYER }],
    });

    // Missing admin
    await expect(runProvenanceDeployment(mockHre)).rejects.toThrow(
      /AMOY_ADMIN_ADDRESS is required for public network deployment/
    );

    // Missing relayer
    process.env.AMOY_ADMIN_ADDRESS = VALID_AMOY_ADMIN;
    await expect(runProvenanceDeployment(mockHre)).rejects.toThrow(
      /AMOY_RELAYER_ADDRESS is required for public network deployment/
    );
  });

  // 3. Invalid or zero addresses rejected
  it('3. Rejects malformed and zero addresses for admin and relayer', async () => {
    const mockHre = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [{ address: VALID_AMOY_DEPLOYER }],
    });

    // Malformed admin
    process.env.AMOY_ADMIN_ADDRESS = '0xinvalid';
    process.env.AMOY_RELAYER_ADDRESS = VALID_AMOY_RELAYER;
    await expect(runProvenanceDeployment(mockHre)).rejects.toThrow(/Invalid admin address/);

    // Zero address admin
    process.env.AMOY_ADMIN_ADDRESS = '0x0000000000000000000000000000000000000000';
    await expect(runProvenanceDeployment(mockHre)).rejects.toThrow(/Admin role cannot be assigned to zero address/);

    // Zero address relayer
    process.env.AMOY_ADMIN_ADDRESS = VALID_AMOY_ADMIN;
    process.env.AMOY_RELAYER_ADDRESS = '0x0000000000000000000000000000000000000000';
    await expect(runProvenanceDeployment(mockHre)).rejects.toThrow(/Relayer role cannot be assigned to zero address/);
  });

  // 4. Prohibits known Hardhat development accounts on Amoy
  it('4. Rejects known Hardhat development accounts on Amoy', async () => {
    const devAccount = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
    expect(KNOWN_DEV_ACCOUNTS.has(devAccount)).toBe(true);

    const mockHre = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [{ address: devAccount }],
    });

    process.env.AMOY_ADMIN_ADDRESS = VALID_AMOY_ADMIN;
    process.env.AMOY_RELAYER_ADDRESS = VALID_AMOY_RELAYER;

    await expect(runProvenanceDeployment(mockHre)).rejects.toThrow(
      /Security violation: Deployer account .* is a known local development account/
    );
  });

  // 5. Enforces role separation on Amoy
  it('5. Enforces role separation: Admin, Relayer, and Deployer must be distinct on Amoy', async () => {
    const mockHre = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [{ address: VALID_AMOY_DEPLOYER }],
    });

    // Reusing admin as relayer
    process.env.AMOY_ADMIN_ADDRESS = VALID_AMOY_ADMIN;
    process.env.AMOY_RELAYER_ADDRESS = VALID_AMOY_ADMIN;
    await expect(runProvenanceDeployment(mockHre)).rejects.toThrow(
      /Admin address and Relayer address must be distinct on public networks/
    );

    // Reusing deployer as relayer
    process.env.AMOY_RELAYER_ADDRESS = VALID_AMOY_DEPLOYER;
    await expect(runProvenanceDeployment(mockHre)).rejects.toThrow(
      /Deployer account cannot be designated as the operational relayer/
    );

    // Reusing deployer as admin
    process.env.AMOY_ADMIN_ADDRESS = VALID_AMOY_DEPLOYER;
    process.env.AMOY_RELAYER_ADDRESS = VALID_AMOY_RELAYER;
    await expect(runProvenanceDeployment(mockHre)).rejects.toThrow(
      /Deployer account cannot be designated as the permanent admin/
    );
  });

  // 6. Mainnet and wrong chain ID rejection
  it('6. Rejects mainnet and network/chainId mismatches', async () => {
    // Ethereum mainnet (chain ID 1)
    const ethHre = createMockHre({ chainId: 1, networkName: 'mainnet' });
    await expect(runProvenanceDeployment(ethHre)).rejects.toThrow(
      /Mainnet deployment \(chain ID 1\) is strictly prohibited/
    );

    // Polygon PoS mainnet (chain ID 137)
    const polyHre = createMockHre({ chainId: 137, networkName: 'polygon' });
    await expect(runProvenanceDeployment(polyHre)).rejects.toThrow(
      /Mainnet deployment \(chain ID 137\) is strictly prohibited/
    );

    // Network mismatch: amoy network name with local chainId
    const mismatchHre = createMockHre({ chainId: 31337, networkName: 'amoy' });
    await expect(runProvenanceDeployment(mismatchHre)).rejects.toThrow(
      /Network mismatch: Configured network is "amoy", but connected RPC returned chain ID 31337/
    );
  });

  // 7. Explicit deployment confirmation gate: DEPLOY_CONFIRM=false halts dry-run with zero broadcasts
  it('7. Dry-run safety gate: halts execution without broadcasting when DEPLOY_CONFIRM is not true', async () => {
    const deployMock = jest.fn();
    const mockHre = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [{ address: VALID_AMOY_DEPLOYER }],
      deployFn: deployMock,
    });

    process.env.AMOY_ADMIN_ADDRESS = VALID_AMOY_ADMIN;
    process.env.AMOY_RELAYER_ADDRESS = VALID_AMOY_RELAYER;
    delete process.env.DEPLOY_CONFIRM; // Not confirmed

    const result = await runProvenanceDeployment(mockHre);

    expect(result.status).toBe('DRY_RUN_HALTED');
    expect(result.chainId).toBe(80002);
    expect(result.networkName).toBe('amoy');
    expect(result.deployer).toBe(VALID_AMOY_DEPLOYER);
    expect(result.admin).toBe(VALID_AMOY_ADMIN);
    expect(result.relayer).toBe(VALID_AMOY_RELAYER);

    // Invariant: Zero deployment transactions broadcast
    expect(deployMock).not.toHaveBeenCalled();
  });

  it('7b. When DEPLOY_CONFIRM=false, halts and prevents any broadcast transaction for Provenance', async () => {
    const deployMock = jest.fn();
    const mockHre = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [{ address: VALID_AMOY_DEPLOYER }],
      deployFn: deployMock,
    });

    process.env.AMOY_ADMIN_ADDRESS = VALID_AMOY_ADMIN;
    process.env.AMOY_RELAYER_ADDRESS = VALID_AMOY_RELAYER;
    process.env.DEPLOY_CONFIRM = 'false';

    const result = await runProvenanceDeployment(mockHre);

    expect(result.status).toBe('DRY_RUN_HALTED');
    expect(deployMock).not.toHaveBeenCalled();
  });

  // 8. Provenance service checks WRITER_ROLE matching deployment script role
  it('8. Provenance service checks WRITER_ROLE matching the role assigned by deployment script', async () => {
    const expectedHash = ethers.id('WRITER_ROLE');
    expect(WRITER_ROLE_HASH).toBe(expectedHash);
  });

  // 9. Provenance service address resolution respects network isolation and rejects dev addresses on Amoy
  it('9. Provenance service rejects local dev contract addresses on Polygon Amoy', async () => {
    process.env.BLOCKCHAIN_NETWORK = 'amoy';
    process.env.POLYGON_RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com';
    process.env.RELAYER_PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    process.env.AMOY_RELAYER_ADDRESS = '0x1Be31A94361a391bBaFB2a4CCd704F57dc04d4bb';

    // Set known Hardhat local address on Amoy
    process.env.PROVENANCE_CONTRACT_ADDRESS = '0x5fbdb2315678afecb367f032d93f642f64180aa3';

    await expect(
      anchorPrediction('test-id', 'test-hash', 'YIELD')
    ).rejects.toThrow(/Local Hardhat contract address .* cannot be used on Polygon Amoy/);
  });
});
