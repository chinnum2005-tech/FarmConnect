import { ethers } from 'ethers';
import prisma from '../database/prisma';
import fs from 'fs';
import path from 'path';

export const PredictionProvenanceABI = [
  "event PredictionAnchored(bytes32 indexed predictionId, bytes32 indexed hash, uint8 predictionType, uint256 blockNumber)"
];

export const KNOWN_LOCAL_HARDHAT_ADDRESSES = [
  '0x5fbdb2315678afecb367f032d93f642f64180aa3',
  '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512',
  '0x46b142dd1e924fab83ecc3c08e4d46e82f005e0e'
];

let activeProvider: ethers.JsonRpcProvider | null = null;
let activeContract: ethers.Contract | null = null;
let lastErrorLogTime = 0;
let suppressedErrorCount = 0;
const ERROR_LOG_INTERVAL_MS = 60000; // 1 minute throttle

/**
 * Determine blockchain operational mode ('local' vs 'amoy').
 */
export function getNetworkMode(): 'local' | 'amoy' {
  const rawNetwork = (process.env.BLOCKCHAIN_NETWORK || '').toLowerCase().trim();
  const rawChainId = (process.env.POLYGON_CHAIN_ID || process.env.CHAIN_ID || '').trim();

  if (rawNetwork === 'amoy' || rawChainId === '80002') {
    return 'amoy';
  }
  if (rawNetwork === 'local' || rawChainId === '31337') {
    return 'local';
  }
  return process.env.NODE_ENV === 'production' ? 'amoy' : 'local';
}

/**
 * Check whether an RPC URL points to localhost or loopback interface.
 */
export function isLocalhostRpc(url: string): boolean {
  if (!url) return false;
  const lower = url.trim().toLowerCase();
  return (
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('0.0.0.0') ||
    lower.includes('[::1]') ||
    lower.includes('::1')
  );
}

/**
 * Sanitize RPC URL to ensure credentials, tokens, or query parameters are not logged.
 */
export function sanitizeRpcUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    if (parsed.username) parsed.username = '***';
    for (const [key] of parsed.searchParams) {
      parsed.searchParams.set(key, '***');
    }
    const segments = parsed.pathname.split('/').map(seg => {
      if (seg.length > 16 && /^[a-zA-Z0-9_-]+$/.test(seg)) {
        return seg.substring(0, 4) + '...' + seg.substring(seg.length - 4);
      }
      return seg;
    });
    parsed.pathname = segments.join('/');
    return parsed.toString();
  } catch {
    return url.replace(/:([^\/@]+)@/, ':***@');
  }
}

/**
 * Load contract address dynamically with network isolation.
 */
export function getProvenanceContractAddress(mode: 'local' | 'amoy'): string | null {
  let address = (process.env.PROVENANCE_CONTRACT_ADDRESS || process.env.PREDICTION_PROVENANCE_ADDRESS || '').trim();

  if (address === ethers.ZeroAddress || address === '0x0000000000000000000000000000000000000000') {
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
      } catch {
        // ignore read failure
      }
    }
  }

  // 2. Read from services/blockchain/deployment-info.json with strict network isolation
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
      } catch {
        // ignore read failure
      }
    }
  }

  if (address === ethers.ZeroAddress || address === '0x0000000000000000000000000000000000000000') {
    address = '';
  }

  return address || null;
}

/**
 * Resolve and validate the target RPC URL.
 */
export function resolveRpcUrl(mode: 'local' | 'amoy', isProduction: boolean): { rpcUrl: string | null; error?: string } {
  const configuredRpc = (process.env.POLYGON_RPC_URL || process.env.RPC_URL || '').trim();

  if (isProduction || mode === 'amoy') {
    if (!configuredRpc) {
      return {
        rpcUrl: null,
        error: 'RPC_URL / POLYGON_RPC_URL not configured. PredictionProvenance listener safely skipped.'
      };
    }
    if (isLocalhostRpc(configuredRpc)) {
      return {
        rpcUrl: null,
        error: `Inconsistent configuration: Localhost RPC URL (${sanitizeRpcUrl(configuredRpc)}) cannot be used with Polygon Amoy / production. PredictionProvenance listener safely skipped.`
      };
    }
    return { rpcUrl: configuredRpc };
  }

  // Local development mode
  if (configuredRpc) {
    return { rpcUrl: configuredRpc };
  }
  return { rpcUrl: 'http://127.0.0.1:8545' };
}

/**
 * Resolve and validate the contract address.
 */
export function resolveContractAddress(mode: 'local' | 'amoy', isProduction: boolean): { address: string | null; error?: string } {
  let address = getProvenanceContractAddress(mode);

  if (!address) {
    if (isProduction || mode === 'amoy') {
      return {
        address: null,
        error: 'PROVENANCE_CONTRACT_ADDRESS not configured for Amoy/production. PredictionProvenance listener safely skipped.'
      };
    }
    address = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
  }

  if (!ethers.isAddress(address)) {
    return {
      address: null,
      error: `Invalid contract address format: "${address}". PredictionProvenance listener safely skipped.`
    };
  }

  if ((isProduction || mode === 'amoy') && KNOWN_LOCAL_HARDHAT_ADDRESSES.includes(address.toLowerCase())) {
    return {
      address: null,
      error: `Inconsistent configuration: Local Hardhat deployment address (${address}) cannot be used on Polygon Amoy. PredictionProvenance listener safely skipped.`
    };
  }

  return { address };
}

/**
 * Stop active listener and tear down provider to prevent hanging handles or unhandled polls.
 */
export function stopProvenanceListener(): void {
  if (activeContract) {
    try {
      activeContract.removeAllListeners();
    } catch {}
    activeContract = null;
  }
  if (activeProvider) {
    try {
      activeProvider.destroy();
    } catch {}
    activeProvider = null;
  }
}

/**
 * Handle incoming PredictionAnchored blockchain event.
 */
export async function handlePredictionAnchoredEvent(
  predictionIdBytes: string,
  hash: string,
  typeInt: number | bigint,
  blockNumber: number | bigint,
  txHash: string
): Promise<string> {
  const cleanHex = predictionIdBytes.slice(2, 34);
  const uuid = [
    cleanHex.slice(0, 8),
    cleanHex.slice(8, 12),
    cleanHex.slice(12, 16),
    cleanHex.slice(16, 20),
    cleanHex.slice(20)
  ].join('-');

  console.log(`🔔 Event received on-chain: Prediction ${uuid} anchored in block ${blockNumber}`);

  await prisma.provenanceRecord.updateMany({
    where: { predictionId: uuid },
    data: {
      txHash,
      blockNumber: Number(blockNumber),
      confirmedAt: new Date()
    }
  });

  const predictionType = Number(typeInt) === 0 ? 'YIELD' : 'CROP';
  if (predictionType === 'YIELD') {
    await prisma.yieldPrediction.updateMany({
      where: { id: uuid },
      data: {
        provenanceStatus: 'CONFIRMED',
        txHash
      }
    });
  } else {
    await prisma.cropRecommendation.updateMany({
      where: { id: uuid },
      data: {
        provenanceStatus: 'CONFIRMED',
        txHash
      }
    });
  }

  return uuid;
}

/**
 * Start background event listener for PredictionProvenance.
 * Returns true if listener successfully bound, false if skipped or connection failed.
 */
export async function startProvenanceListener(): Promise<boolean> {
  try {
    stopProvenanceListener();

    const isProduction = process.env.NODE_ENV === 'production';
    const mode = getNetworkMode();

    // 1. Resolve and validate RPC URL
    const rpcResult = resolveRpcUrl(mode, isProduction);
    if (!rpcResult.rpcUrl) {
      if (rpcResult.error?.includes('Inconsistent configuration')) {
        console.warn(`⚠️ [ProvenanceListener] ${rpcResult.error}`);
      } else {
        console.info(`ℹ️ [ProvenanceListener] ${rpcResult.error || 'RPC URL not configured.'}`);
      }
      return false;
    }
    const targetRpc = rpcResult.rpcUrl;
    const sanitizedRpc = sanitizeRpcUrl(targetRpc);

    // 2. Resolve and validate Contract Address
    const addressResult = resolveContractAddress(mode, isProduction);
    if (!addressResult.address) {
      if (addressResult.error?.includes('Inconsistent configuration') || addressResult.error?.includes('Invalid contract address')) {
        console.warn(`⚠️ [ProvenanceListener] ${addressResult.error}`);
      } else {
        console.info(`ℹ️ [ProvenanceListener] ${addressResult.error || 'Contract address not configured.'}`);
      }
      return false;
    }
    const contractAddress = addressResult.address;

    // 3. Instantiate provider with throttled error handling
    const provider = new ethers.JsonRpcProvider(targetRpc);
    activeProvider = provider;

    provider.on('error', (err: any) => {
      const now = Date.now();
      if (now - lastErrorLogTime > ERROR_LOG_INTERVAL_MS) {
        if (suppressedErrorCount > 0) {
          console.warn(`⚠️ [ProvenanceListener] (${suppressedErrorCount} repeated RPC errors suppressed in last 60s)`);
          suppressedErrorCount = 0;
        }
        console.warn('⚠️ [ProvenanceListener] JSON-RPC Provider warning:', err?.message || err);
        lastErrorLogTime = now;
      } else {
        suppressedErrorCount++;
      }
    });

    // 4. Preflight RPC connection with timeout to prevent continuous retry loop if unreachable
    let timerId: NodeJS.Timeout | null = null;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => reject(new Error('RPC connection verification timed out after 3000ms')), 3000);
      });
      const network = await Promise.race([provider.getNetwork(), timeoutPromise]);
      if (timerId) clearTimeout(timerId);

      if (mode === 'amoy' && Number(network.chainId) !== 80002) {
        console.warn(
          `⚠️ [ProvenanceListener] Chain ID mismatch: connected network has chainId ${network.chainId}, expected 80002 for Polygon Amoy. Listener disabled.`
        );
        stopProvenanceListener();
        return false;
      }
    } catch (connErr: any) {
      if (timerId) clearTimeout(timerId);
      stopProvenanceListener();
      if (mode === 'amoy' || isProduction) {
        console.warn(`⚠️ [ProvenanceListener] Failed to connect to RPC endpoint (${sanitizedRpc}): ${connErr?.message || connErr}. Listener safely disabled.`);
      } else {
        console.info(`ℹ️ [ProvenanceListener] Local RPC node (${sanitizedRpc}) is unreachable. Listener safely disabled (start local Hardhat node to enable).`);
      }
      return false;
    }

    // 5. Register contract event listener
    const contract = new ethers.Contract(contractAddress, PredictionProvenanceABI, provider);
    activeContract = contract;

    console.log(`📡 [ProvenanceListener] Starting background event listener for PredictionProvenance at ${contractAddress} (${sanitizedRpc})...`);

    contract.on("PredictionAnchored", async (predictionIdBytes, hash, typeInt, blockNumber, event) => {
      try {
        const txHash = event?.log?.transactionHash || '';
        await handlePredictionAnchoredEvent(predictionIdBytes, hash, typeInt, blockNumber, txHash);
      } catch (err) {
        console.error('Error handling PredictionAnchored event:', err);
      }
    });

    return true;
  } catch (error: any) {
    stopProvenanceListener();
    console.warn('⚠️ [ProvenanceListener] Failed to initialize PredictionProvenance background listener:', error?.message || error);
    return false;
  }
}

