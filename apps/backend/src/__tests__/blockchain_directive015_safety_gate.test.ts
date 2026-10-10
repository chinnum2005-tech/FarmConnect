import path from 'path';
import fs from 'fs';

// Import deploy tooling
const { runDeployment, KNOWN_DEV_ACCOUNTS } = require('../../../../blockchain/scripts/deploy');

describe('Directive 015: Final Deployment-Script Safety Gate & Dry-Run Verification', () => {
  const envBackup: NodeJS.ProcessEnv = { ...process.env };

  beforeEach(() => {
    // Reset process.env to pristine state
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

  // -------------------------------------------------------------------------
  // 1. Mainnet Deployment Prohibition
  // -------------------------------------------------------------------------
  it('1. Rejects Ethereum and Polygon mainnet deployment paths unconditionally', async () => {
    const mockHreEthMainnet = createMockHre({ chainId: 1, networkName: 'mainnet' });
    await expect(runDeployment(mockHreEthMainnet)).rejects.toThrow(
      /Security violation: Mainnet deployment \(chain ID 1\) is strictly prohibited/
    );

    const mockHrePolygonMainnet = createMockHre({ chainId: 137, networkName: 'polygon' });
    await expect(runDeployment(mockHrePolygonMainnet)).rejects.toThrow(
      /Security violation: Mainnet deployment \(chain ID 137\) is strictly prohibited/
    );
  });

  // -------------------------------------------------------------------------
  // 2. Network and Chain ID Mismatch
  // -------------------------------------------------------------------------
  it('2. Rejects mismatch between configured network name and connected RPC chain ID', async () => {
    // amoy network with localhost chainId 31337
    const mockHreMismatch = createMockHre({ chainId: 31337, networkName: 'amoy' });
    await expect(runDeployment(mockHreMismatch)).rejects.toThrow(
      /Network mismatch: Configured network is "amoy", but connected RPC returned chain ID 31337 \(expected 80002\)/
    );

    // localhost network with amoy chainId 80002
    const mockHreLocalMismatch = createMockHre({ chainId: 80002, networkName: 'localhost' });
    await expect(runDeployment(mockHreLocalMismatch)).rejects.toThrow(
      /Network mismatch: Configured network is "localhost", but connected RPC returned chain ID 80002/
    );
  });

  // -------------------------------------------------------------------------
  // 3. Unsupported Network Rejection
  // -------------------------------------------------------------------------
  it('3. Rejects unsupported arbitrary networks that are neither local nor Amoy', async () => {
    const mockHreUnknown = createMockHre({ chainId: 56, networkName: 'bsc' });
    await expect(runDeployment(mockHreUnknown)).rejects.toThrow(
      /Unsupported network: Chain ID 56 \(bsc\) is not supported for deployment/
    );
  });

  // -------------------------------------------------------------------------
  // 4. Missing Deployment Signer
  // -------------------------------------------------------------------------
  it('4. Rejects execution if no deployment signer is configured', async () => {
    const mockHreNoSigner = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [],
    });
    await expect(runDeployment(mockHreNoSigner)).rejects.toThrow(
      /No deployment signer configured for network "amoy"/
    );
  });

  // -------------------------------------------------------------------------
  // 5. Rejection of Known Hardhat Development Accounts
  // -------------------------------------------------------------------------
  it('5. Rejects known Hardhat development accounts for deployer on Amoy', async () => {
    const devAccount0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    const mockHreDevDeployer = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [{ address: devAccount0 }],
    });
    process.env.AMOY_ADMIN_ADDRESS = '0x1111111111111111111111111111111111111111';
    process.env.AMOY_RELAYER_ADDRESS = '0x2222222222222222222222222222222222222222';

    await expect(runDeployment(mockHreDevDeployer)).rejects.toThrow(
      /Security violation: Deployer account .* is a known local development account, prohibited on public networks/
    );
  });

  it('6. Rejects known Hardhat development accounts for admin or relayer on Amoy', async () => {
    const safeDeployer = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const devAccount1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    const mockHre = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [{ address: safeDeployer }],
    });

    // Dev account as admin
    process.env.AMOY_ADMIN_ADDRESS = devAccount1;
    process.env.AMOY_RELAYER_ADDRESS = '0x3333333333333333333333333333333333333333';
    await expect(runDeployment(mockHre)).rejects.toThrow(
      /Security violation: Admin address .* is a known local development account/
    );

    // Dev account as relayer
    process.env.AMOY_ADMIN_ADDRESS = '0x4444444444444444444444444444444444444444';
    process.env.AMOY_RELAYER_ADDRESS = devAccount1;
    await expect(runDeployment(mockHre)).rejects.toThrow(
      /Security violation: Relayer address .* is a known local development account/
    );
  });

  // -------------------------------------------------------------------------
  // 6. Address Validation: Zero Address and Malformed Addresses
  // -------------------------------------------------------------------------
  it('7. Rejects zero-address and malformed address for admin or relayer', async () => {
    const safeDeployer = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const mockHre = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [{ address: safeDeployer }],
    });

    // Zero address as admin
    process.env.AMOY_ADMIN_ADDRESS = '0x0000000000000000000000000000000000000000';
    process.env.AMOY_RELAYER_ADDRESS = '0x2222222222222222222222222222222222222222';
    await expect(runDeployment(mockHre)).rejects.toThrow(
      /Address validation failure: Admin role cannot be assigned to zero address/
    );

    // Zero address as relayer
    process.env.AMOY_ADMIN_ADDRESS = '0x1111111111111111111111111111111111111111';
    process.env.AMOY_RELAYER_ADDRESS = '0x0000000000000000000000000000000000000000';
    await expect(runDeployment(mockHre)).rejects.toThrow(
      /Address validation failure: Relayer role cannot be assigned to zero address/
    );

    // Malformed address
    process.env.AMOY_ADMIN_ADDRESS = 'not-an-address';
    await expect(runDeployment(mockHre)).rejects.toThrow(
      /Invalid admin address: "not-an-address"/
    );
  });

  // -------------------------------------------------------------------------
  // 7. Role Separation Enforcement
  // -------------------------------------------------------------------------
  it('8. Enforces role separation: Admin and Relayer cannot be the same address on Amoy', async () => {
    const safeDeployer = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const sameAddress = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

    const mockHre = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [{ address: safeDeployer }],
    });

    process.env.AMOY_ADMIN_ADDRESS = sameAddress;
    process.env.AMOY_RELAYER_ADDRESS = sameAddress; // Conflicting role!

    await expect(runDeployment(mockHre)).rejects.toThrow(
      /Role conflict: Admin address and Relayer address must be distinct on public networks/
    );
  });

  it('9. Enforces role separation: Deployer account cannot also serve as Relayer on Amoy', async () => {
    const safeDeployer = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const distinctAdmin = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

    const mockHre = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [{ address: safeDeployer }],
    });

    process.env.AMOY_ADMIN_ADDRESS = distinctAdmin;
    process.env.AMOY_RELAYER_ADDRESS = safeDeployer; // Deployer reused as relayer!

    await expect(runDeployment(mockHre)).rejects.toThrow(
      /Role conflict: Deployer account cannot be designated as the operational relayer on public networks/
    );
  });

  it('10. Requires explicit AMOY_RELAYER_ADDRESS on public networks and refuses silent defaulting', async () => {
    const safeDeployer = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const mockHre = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [{ address: safeDeployer }],
    });

    delete process.env.AMOY_RELAYER_ADDRESS;

    await expect(runDeployment(mockHre)).rejects.toThrow(
      /AMOY_RELAYER_ADDRESS is required for public network deployment/
    );
  });

  // -------------------------------------------------------------------------
  // 8. Fail-Safe Authorization Gate & Dry-Run Verification
  // -------------------------------------------------------------------------
  it('11. Dry-run safety gate: Halts execution without broadcasting when DEPLOY_CONFIRM is not true', async () => {
    const safeDeployer = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const safeAdmin = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    const safeRelayer = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

    const deployMock = jest.fn();
    const getDeployTxMock = jest.fn().mockResolvedValue({
      data: '0x608060405234801561001057600080fd5b50',
    });

    const mockHre = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [{ address: safeDeployer }],
      deployFn: deployMock,
      getDeployTxFn: getDeployTxMock,
    });

    process.env.AMOY_ADMIN_ADDRESS = safeAdmin;
    process.env.AMOY_RELAYER_ADDRESS = safeRelayer;
    delete process.env.DEPLOY_CONFIRM; // NOT confirmed

    const addressFile = path.join(__dirname, '../../../../blockchain/contract-address.json');
    const originalAddressContent = fs.readFileSync(addressFile, 'utf8');

    const result = await runDeployment(mockHre);

    // 1. Result confirms dry run halted
    expect(result.status).toBe('DRY_RUN_HALTED');
    expect(result.chainId).toBe(80002);
    expect(result.networkName).toBe('amoy');

    // 2. Pre-flight bytecode validation was performed offline
    expect(getDeployTxMock).toHaveBeenCalledWith(safeAdmin, safeRelayer);

    // 3. ZERO deployment or broadcast calls occurred
    expect(deployMock).not.toHaveBeenCalled();

    // 4. contract-address.json was NOT modified
    const currentAddressContent = fs.readFileSync(addressFile, 'utf8');
    expect(currentAddressContent).toBe(originalAddressContent);
  });

  it('12. When DEPLOY_CONFIRM=false, halts and prevents any broadcast transaction', async () => {
    const safeDeployer = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const safeAdmin = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    const safeRelayer = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

    const deployMock = jest.fn();
    const mockHre = createMockHre({
      chainId: 80002,
      networkName: 'amoy',
      signers: [{ address: safeDeployer }],
      deployFn: deployMock,
    });

    process.env.AMOY_ADMIN_ADDRESS = safeAdmin;
    process.env.AMOY_RELAYER_ADDRESS = safeRelayer;
    process.env.DEPLOY_CONFIRM = 'false';

    const result = await runDeployment(mockHre);

    expect(result.status).toBe('DRY_RUN_HALTED');
    expect(deployMock).not.toHaveBeenCalled();
  });
});
