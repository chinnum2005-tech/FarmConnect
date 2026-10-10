import crypto from 'crypto';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import prisma from '../database/prisma';

// Human-readable ABI for contract interaction
const PredictionProvenanceABI = [
  "function recordPredictionHash(bytes32 predictionId, bytes32 hash, uint8 predictionType) public returns (bool)",
  "function getPredictionProvenance(bytes32 predictionId) public view returns (bytes32 hash, uint8 predictionType, uint256 blockNumber, uint256 timestamp)",
  "function hasRole(bytes32 role, address account) public view returns (bool)",
  "function WRITER_ROLE() public view returns (bytes32)"
];

/**
 * Canonical bytes32 identifier for WRITER_ROLE on PredictionProvenance (keccak256("WRITER_ROLE")).
 */
export const WRITER_ROLE_HASH = ethers.id("WRITER_ROLE");

/**
 * Resets the cached provenance role verification status.
 * Maintained for backward compatibility. In Directive 022, authorization caching
 * was eliminated in favor of real-time on-chain role checks to prevent stale authorization
 * after administrative role revocation.
 */
export function clearProvenanceAuthorizationCache(): void {
  // No-op: Caching removed in Directive 022 to eliminate stale role revocation risks.
}

/**
 * Verifies on-chain that signerAddress possesses WRITER_ROLE on the provenance contract
 * before state-changing predictions can be anchored. Fails closed if query fails or role is false.
 * Real-time query executed on every transaction initialization to prevent stale authorization.
 */
export async function verifyProvenanceRole(
  signerAddress: string,
  contract: ethers.Contract,
  contractAddress: string
): Promise<boolean> {
  let roleHash: string = WRITER_ROLE_HASH;
  try {
    if (typeof contract.WRITER_ROLE === 'function') {
      roleHash = await contract.WRITER_ROLE();
    }
  } catch {
    roleHash = WRITER_ROLE_HASH;
  }

  let hasRole: boolean;
  try {
    hasRole = await contract.hasRole(roleHash, signerAddress);
  } catch (err: any) {
    throw new Error(
      `[ProvenanceService] Relayer role verification failed: Unable to query WRITER_ROLE for address ${signerAddress} on contract ${contractAddress}: ${err?.message || err}`
    );
  }

  if (!hasRole) {
    throw new Error(
      `[ProvenanceService] Relayer authorization failure: Signer address (${signerAddress}) does not hold WRITER_ROLE on contract (${contractAddress}). State-changing transactions rejected.`
    );
  }

  return true;
}

// Helper to get network mode
function getNetworkMode(): 'local' | 'amoy' {
  const mode = process.env.BLOCKCHAIN_NETWORK;
  if (mode === 'amoy') return 'amoy';
  return 'local';
}

// Helper to load deployed contract address dynamically with network isolation
function getContractAddress(): string | null {
  const mode = getNetworkMode();
  let address = (process.env.PROVENANCE_CONTRACT_ADDRESS || process.env.PREDICTION_PROVENANCE_ADDRESS || '').trim();

  // Normalize placeholder zero address as unconfigured
  if (address === '0x0000000000000000000000000000000000000000') {
    address = '';
  }

  // 1. Read from blockchain/contract-address.json with strict network isolation
  if (!address) {
    const contractAddressPath = path.join(__dirname, '../../../../blockchain/contract-address.json');
    if (fs.existsSync(contractAddressPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(contractAddressPath, 'utf8'));
        if (mode === 'local') {
          address = (data['31337'] && data['31337'].PredictionProvenance) || data.PredictionProvenance || '';
        } else if (mode === 'amoy') {
          address = (data['80002'] && data['80002'].PredictionProvenance) || '';
        }
      } catch (e) {
        // ignore read failure
      }
    }
  }

  // 2. Read from services/blockchain/deployment-info.json with network isolation
  if (!address) {
    const deployInfoPath = path.join(__dirname, '../../../../services/blockchain/deployment-info.json');
    if (fs.existsSync(deployInfoPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(deployInfoPath, 'utf8'));
        if (mode === 'local') {
          address = (data['31337'] && data['31337'].provenanceAddress) || data.provenanceAddress || '';
        } else if (mode === 'amoy') {
          address = (data['80002'] && data['80002'].provenanceAddress) || '';
        }
      } catch (e) {
        console.error('[ProvenanceService] Error reading deployment-info.json', e);
      }
    }
  }

  // Normalize placeholder zero address
  if (address === '0x0000000000000000000000000000000000000000') {
    address = '';
  }

  // Guard: Ensure known local Hardhat addresses never silently become Amoy contract address
  const knownLocalHardhatAddresses = [
    '0x5fbdb2315678afecb367f032d93f642f64180aa3',
    '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512',
    '0x46b142dd1e924fab83ecc3c08e4d46e82f005e0e'
  ];
  if (mode === 'amoy' && address && knownLocalHardhatAddresses.includes(address.toLowerCase())) {
    throw new Error(
      `[ProvenanceService] Inconsistent configuration: Local Hardhat contract address (${address}) cannot be used on Polygon Amoy (chainId 80002).`
    );
  }

  return address || null;
}

// Helper to construct contract instance dynamically
async function getContract(): Promise<ethers.Contract | null> {
  const mode = getNetworkMode();
  const contractAddress = getContractAddress();

  if (!contractAddress) {
    if (mode === 'amoy') {
      throw new Error('PROVENANCE_CONTRACT_ADDRESS is missing in amoy mode');
    }
    return null; // Fallback permitted in local mode
  }

  let rpcUrl: string;
  let privateKey: string;

  if (mode === 'amoy') {
    rpcUrl = process.env.POLYGON_RPC_URL || process.env.RPC_URL || '';
    privateKey = (process.env.RELAYER_PRIVATE_KEY || '').trim();

    if (!rpcUrl) {
      throw new Error('RPC_URL or POLYGON_RPC_URL is missing in amoy mode');
    }
    if (!privateKey) {
      throw new Error('RELAYER_PRIVATE_KEY is missing in amoy mode');
    }

    // Guard: Prohibit Hardhat development key on Amoy
    const KNOWN_DEV_KEYS = new Set([
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    ]);
    if (KNOWN_DEV_KEYS.has(privateKey.toLowerCase())) {
      throw new Error('[ProvenanceService] Security violation: Hardhat development private key is strictly prohibited on Polygon Amoy.');
    }
  } else {
    rpcUrl = process.env.POLYGON_RPC_URL || process.env.RPC_URL || 'http://127.0.0.1:8545';
    privateKey = (process.env.RELAYER_PRIVATE_KEY || '').trim() || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  }

  // Guard: Signer identity verification against explicitly configured relayer address
  const expectedRelayer = (process.env.AMOY_RELAYER_ADDRESS || process.env.RELAYER_ADDRESS || '').trim();

  if (mode === 'amoy') {
    if (!expectedRelayer) {
      throw new Error(
        '[ProvenanceService] Missing expected relayer address on Polygon Amoy. Please configure AMOY_RELAYER_ADDRESS (or RELAYER_ADDRESS).'
      );
    }
  }

  if (expectedRelayer) {
    if (!ethers.isAddress(expectedRelayer) || expectedRelayer === ethers.ZeroAddress) {
      throw new Error(
        `[ProvenanceService] Malformed expected relayer address: "${expectedRelayer}" is not a valid non-zero Ethereum address.`
      );
    }
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Guard: Verify expected chain ID before transaction submission in Amoy mode
    if (mode === 'amoy') {
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== 80002) {
        throw new Error(
          `[ProvenanceService] Chain ID mismatch: connected network has chainId ${network.chainId}, but expected 80002 for Polygon Amoy.`
        );
      }
    }

    const wallet = new ethers.Wallet(privateKey, provider);

    if (expectedRelayer && wallet.address.toLowerCase() !== expectedRelayer.toLowerCase()) {
      throw new Error(
        `[ProvenanceService] Relayer address mismatch: configured expected relayer address (${expectedRelayer}) does not match signing wallet address (${wallet.address}) derived from RELAYER_PRIVATE_KEY.`
      );
    }

    const contract = new ethers.Contract(contractAddress, PredictionProvenanceABI, wallet);

    // Mandatory Authorization Preflight in Amoy mode
    if (mode === 'amoy') {
      await verifyProvenanceRole(wallet.address, contract, contractAddress);
    }

    return contract;
  } catch (error) {
    if (mode === 'amoy') {
      throw error;
    }
    return null;
  }
}

/**
 * Compute reproducible deterministic SHA-256 hash of inputs, model, and output
 */
export function computePredictionHash(inputSnapshot: any, modelVersion: string, output: number | string): string {
  const sortedInput: any = {};
  Object.keys(inputSnapshot).sort().forEach(key => {
    sortedInput[key] = inputSnapshot[key];
  });
  
  const dataToHash = JSON.stringify({
    inputs: sortedInput,
    modelVersion,
    output
  });
  
  return crypto.createHash('sha256').update(dataToHash).digest('hex');
}

/**
 * Anchor a prediction hash on-chain asynchronously
 */
export async function anchorPrediction(
  predictionId: string,
  predictionHash: string,
  predictionType: 'YIELD' | 'CROP'
): Promise<string | null> {
  const mode = getNetworkMode();
  let contract: ethers.Contract | null = null;

  try {
    contract = await getContract();
  } catch (error) {
    console.error('[ProvenanceService] Contract Initialization Hard Fail (Amoy):', error);
    await updatePredictionStatus(predictionId, predictionType, 'NOT_CONFIGURED');
    if (mode === 'amoy') {
      throw error;
    }
    return null;
  }

  if (!contract) {
    console.warn('[ProvenanceService] Provenance contract not reachable in local mode. Executing SIMULATED FALLBACK.');
    const fakeHash = '0x' + crypto.randomBytes(32).toString('hex');
    await updatePredictionStatus(predictionId, predictionType, 'SIMULATED', fakeHash);
    return fakeHash;
  }

  try {
    // Format UUID as bytes32
    const cleanUuid = predictionId.replace(/-/g, '');
    const bytes32Id = '0x' + cleanUuid.padEnd(64, '0');
    
    // predictionHash is a 32-byte hex string (sha256 output)
    const bytes32Hash = '0x' + predictionHash;
    const typeInt = predictionType === 'YIELD' ? 0 : 1;

    console.log(`[ProvenanceService] Submitting anchor tx for predictionId: ${predictionId} on ${mode}...`);
    const tx = await contract.recordPredictionHash(bytes32Id, bytes32Hash, typeInt);
    
    const confirmations = mode === 'amoy' ? 3 : 1;

    // Asynchronous mining resolution
    tx.wait(confirmations).then(async (receipt: any) => {
      console.log(`✅ [ProvenanceService] Anchor tx confirmed for prediction ${predictionId} at block ${receipt.blockNumber}`);
      await prisma.provenanceRecord.updateMany({
        where: { predictionId },
        data: {
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          confirmedAt: new Date()
        }
      });
      
      await updatePredictionStatus(predictionId, predictionType, 'CONFIRMED', receipt.hash);
    }).catch(async (err: any) => {
      console.error(`❌ [ProvenanceService] Anchor tx reverted for prediction ${predictionId}:`, err);
      await updatePredictionStatus(predictionId, predictionType, 'FAILED');
    });

    return tx.hash;

  } catch (error) {
    if (mode === 'amoy') {
      console.error('[ProvenanceService] Amoy Anchor Tx Hard Fail:', error);
      await updatePredictionStatus(predictionId, predictionType, 'FAILED');
      throw new Error(`Provenance anchoring failed on Amoy: ${error}`);
    } else {
      console.warn('[ProvenanceService] Local Anchor Tx Failed, falling back to SIMULATED:', error);
      const fakeHash = '0x' + crypto.randomBytes(32).toString('hex');
      await updatePredictionStatus(predictionId, predictionType, 'SIMULATED', fakeHash);
      return fakeHash;
    }
  }
}

async function updatePredictionStatus(
  predictionId: string,
  type: 'YIELD' | 'CROP',
  status: 'PENDING' | 'CONFIRMED' | 'SIMULATED' | 'NOT_CONFIGURED' | 'FAILED',
  txHash?: string
) {
  try {
    const updateData: any = { provenanceStatus: status };
    if (txHash) {
      updateData.txHash = txHash;
    }

    if (type === 'YIELD') {
      await prisma.yieldPrediction.updateMany({
        where: { id: predictionId },
        data: updateData
      });
    } else {
      await prisma.cropRecommendation.updateMany({
        where: { id: predictionId },
        data: updateData
      });
    }
  } catch (e) {
    console.error('[ProvenanceService] Failed to update prediction status in DB:', e);
  }
}
