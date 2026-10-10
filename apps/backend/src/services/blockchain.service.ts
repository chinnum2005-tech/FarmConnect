import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import {
  hashEvidence,
  toBatchIdBytes32,
  isValidBytes32,
  canonicalizeToJson,
} from './evidenceHasher';

/**
 * ABI for canonical AgroTraceRegistry smart contract.
 */
export const AGROTRACE_REGISTRY_ABI = [
  "function registerBatch(bytes32 batchId, uint8 initialEventType, bytes32 initialEvidenceHash, address originatingActor) external",
  "function recordEvent(bytes32 batchId, uint8 eventType, bytes32 evidenceHash, address originatingActor) external returns (uint256)",
  "function getBatch(bytes32 batchId) external view returns (bytes32 id, uint8 initialEventType, bytes32 initialEvidenceHash, uint64 registeredAt, bool exists, uint256 eventCount)",
  "function getEventCount(bytes32 batchId) external view returns (uint256)",
  "function getEventByIndex(bytes32 batchId, uint256 index) external view returns (uint8 eventType, bytes32 evidenceHash, uint64 timestamp, address submitter, address originatingActor)",
  "function getTraceEvent(bytes32 batchId, uint256 index) external view returns (uint8 eventType, bytes32 evidenceHash, uint64 timestamp, address submitter, address originatingActor)",
  "function getBatchEvents(bytes32 batchId) external view returns (tuple(uint8 eventType, bytes32 evidenceHash, uint64 timestamp, address submitter, address originatingActor)[])",
  "function verifyCommitment(bytes32 batchId, uint8 eventType, bytes32 evidenceHash) external view returns (bool)",
  "function hasRole(bytes32 role, address account) external view returns (bool)",
  "function RELAYER_ROLE() external view returns (bytes32)",
  "function paused() external view returns (bool)",
  "event BatchRegistered(bytes32 indexed batchId, uint8 indexed initialEventType, bytes32 indexed initialEvidenceHash, uint64 timestamp, address submitter, address originatingActor)",
  "event EventRecorded(bytes32 indexed batchId, uint8 indexed eventType, bytes32 indexed evidenceHash, uint256 eventIndex, uint64 timestamp, address submitter, address originatingActor)"
];

/**
 * Canonical bytes32 identifier for RELAYER_ROLE on AgroTraceRegistry (keccak256("RELAYER_ROLE")).
 */
export const RELAYER_ROLE_HASH = ethers.id("RELAYER_ROLE");

/**
 * Canonical supply-chain stages matching AgroTraceRegistry.sol and Prisma schema.
 */
export enum RegistryEventType {
  PLANTED = 0,
  HARVESTED = 1,
  PROCESSED = 2,
  PACKAGED = 3,
  SHIPPED = 4,
  RECEIVED = 5,
  QUALITY_CHECK = 6,
  RETAIL = 7,
  SOLD = 8,
}

/**
 * Maps a string event type representation to the RegistryEventType enum.
 */
export function toRegistryEventType(type: string | number): RegistryEventType {
  if (typeof type === 'number') {
    if (type >= 0 && type <= 8) return type as RegistryEventType;
    throw new Error(`Invalid event type numeric code: ${type}`);
  }
  const upper = String(type).trim().toUpperCase().replace(/[\s-]+/g, '_');
  switch (upper) {
    case 'PLANTED': return RegistryEventType.PLANTED;
    case 'HARVESTED': return RegistryEventType.HARVESTED;
    case 'PROCESSED': return RegistryEventType.PROCESSED;
    case 'PACKAGED': return RegistryEventType.PACKAGED;
    case 'SHIPPED': return RegistryEventType.SHIPPED;
    case 'RECEIVED': return RegistryEventType.RECEIVED;
    case 'QUALITY_CHECK': return RegistryEventType.QUALITY_CHECK;
    case 'RETAIL': return RegistryEventType.RETAIL;
    case 'SOLD': return RegistryEventType.SOLD;
    default:
      throw new Error(`Unrecognized event type: ${type}`);
  }
}

export type VerificationStatus = 'VERIFIED' | 'MISMATCH' | 'NOT_FOUND' | 'PENDING' | 'UNAVAILABLE';

export interface VerificationResult {
  status: VerificationStatus;
  batchId: string;
  batchIdBytes32: string;
  onChainBatchExists: boolean;
  computedEvidenceHash: string;
  onChainEvidenceHash?: string;
  match: boolean;
  blockNumber?: number;
  transactionHash?: string;
  timestamp?: Date;
  details: string;
}

export interface TransactionSubmissionResult {
  txHash: string;
  blockNumber: number;
  batchIdBytes32: string;
  evidenceHash: string;
  eventIndex?: number;
  confirmations: number;
  simulated?: false;
  metadataHash?: string;
}

export interface BatchQueryResult {
  batchId: string;
  initialEventType: RegistryEventType;
  initialEvidenceHash: string;
  registeredAt: Date;
  exists: boolean;
  eventCount: number;
}

export interface TraceEventQueryResult {
  eventType: RegistryEventType;
  evidenceHash: string;
  timestamp: Date;
  submitter: string;
  originatingActor: string;
}

/**
 * Simple in-memory mutex to serialize blockchain transaction dispatch
 * within a single Node.js process to guarantee sequential nonces.
 */
class NonceMutex {
  private _locked = false;
  private _waiting: (() => void)[] = [];

  async lock(): Promise<() => void> {
    while (this._locked) {
      await new Promise<void>(resolve => this._waiting.push(resolve));
    }
    this._locked = true;

    return () => {
      this._locked = false;
      const next = this._waiting.shift();
      if (next) next();
    };
  }
}

export interface BlockchainConfig {
  mode: 'local' | 'amoy';
  rpcUrl: string;
  contractAddress: string;
  privateKey: string;
  expectedChainId: number;
  expectedRelayerAddress?: string;
}

export class BlockchainService {
  private _mutex = new NonceMutex();

  /**
   * Clears the relayer authorization verification cache.
   * Maintained for backward compatibility. In Directive 022, authorization caching
   * was eliminated in favor of real-time on-chain role checks to prevent stale authorization
   * after administrative role revocation.
   */
  clearRelayerAuthorizationCache(): void {
    // No-op: Caching removed in Directive 022 to prevent stale role authorization.
  }

  /**
   * Resolves configuration seamlessly across variable name variants:
   * - POLYGON_RPC_URL (priority) or RPC_URL
   * - AGROTRACE_REGISTRY_ADDRESS (priority) or TRACEABILITY_CONTRACT_ADDRESS
   * - RELAYER_PRIVATE_KEY (canonical runtime signer)
   * - AMOY_RELAYER_ADDRESS or RELAYER_ADDRESS (for identity verification)
   * - POLYGON_CHAIN_ID or CHAIN_ID
   */
  getConfig(): BlockchainConfig {
    const rawNetworkEnv = (process.env.BLOCKCHAIN_NETWORK || '').toLowerCase().trim();
    const rawChainId = process.env.POLYGON_CHAIN_ID || process.env.CHAIN_ID;
    const isAmoyNetwork = rawNetworkEnv === 'amoy';
    const isLocalNetwork = rawNetworkEnv === 'local';

    let expectedChainId: number;
    if (rawChainId) {
      expectedChainId = parseInt(rawChainId, 10);
    } else {
      expectedChainId = isAmoyNetwork ? 80002 : 31337;
    }

    // Determine operational mode
    let mode: 'local' | 'amoy';
    if (isAmoyNetwork || expectedChainId === 80002) {
      mode = 'amoy';
    } else if (isLocalNetwork || (!rawNetworkEnv && process.env.NODE_ENV !== 'production')) {
      mode = 'local';
    } else {
      mode = process.env.NODE_ENV === 'production' ? 'amoy' : 'local';
    }

    // Invariant: Explicit Amoy network name cannot have non-Amoy chainId
    if (isAmoyNetwork && !isNaN(expectedChainId) && expectedChainId !== 80002) {
      throw new Error(`[BlockchainService] Inconsistent configuration: Polygon Amoy network requires chain ID 80002, but resolved ${expectedChainId}.`);
    }
    // Invariant: Explicit Local network name cannot have Amoy chainId
    if (isLocalNetwork && expectedChainId === 80002) {
      throw new Error(`[BlockchainService] Inconsistent configuration: Local network configuration cannot use Polygon Amoy chain ID 80002.`);
    }

    const rpcUrl = process.env.POLYGON_RPC_URL || process.env.RPC_URL || (mode === 'local' ? 'http://127.0.0.1:8545' : '');

    // Guard: Prevent localhost RPC from silently being used with Amoy
    if (mode === 'amoy' && rpcUrl && (rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost'))) {
      throw new Error(`[BlockchainService] Inconsistent configuration: Localhost RPC URL (${rpcUrl}) cannot be used with Polygon Amoy.`);
    }

    let contractAddress = (process.env.AGROTRACE_REGISTRY_ADDRESS || process.env.TRACEABILITY_CONTRACT_ADDRESS || '').trim();
    // Normalize placeholder zero address as unconfigured
    if (contractAddress === '0x0000000000000000000000000000000000000000') {
      contractAddress = '';
    }

    // Read from contract-address.json with strict network isolation
    if (!contractAddress) {
      const addressPath = path.join(__dirname, '../../../../blockchain/contract-address.json');
      if (fs.existsSync(addressPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(addressPath, 'utf8'));
          if (mode === 'local') {
            contractAddress = (data['31337'] && data['31337'].AgroTraceRegistry) || data.AgroTraceRegistry || data.Traceability || '';
          } else if (mode === 'amoy') {
            // Strictly check network-scoped 80002 section only. Never fall back to root local address!
            contractAddress = (data['80002'] && data['80002'].AgroTraceRegistry) || '';
          }
        } catch (e) {
          // ignore read failure
        }
      }
    }

    // Guard: Ensure known local Hardhat addresses never silently become Amoy address
    const knownLocalHardhatAddresses = [
      '0x5fbdb2315678afecb367f032d93f642f64180aa3',
      '0x46b142dd1e924fab83ecc3c08e4d46e82f005e0e',
      '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512'
    ];
    if (mode === 'amoy' && contractAddress && knownLocalHardhatAddresses.includes(contractAddress.toLowerCase())) {
      throw new Error(`[BlockchainService] Inconsistent configuration: Local Hardhat contract address (${contractAddress}) cannot be used on Polygon Amoy (chainId 80002).`);
    }

    // CRITICAL SECURITY GUARD:
    // Fallback to local default development key is strictly permitted ONLY when:
    // 1. Mode is explicitly local and not Amoy/production
    // 2. Expected Chain ID is 31337 or 1337 (local testnet)
    // 3. RPC URL points strictly to localhost / 127.0.0.1
    // Any non-local network MUST supply an explicit environment variable or fail closed.
    const isExplicitLocalDev =
      mode === 'local' &&
      !isAmoyNetwork &&
      process.env.NODE_ENV !== 'production' &&
      (expectedChainId === 31337 || expectedChainId === 1337) &&
      (!rpcUrl || rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost'));

    // Canonical runtime signing key: RELAYER_PRIVATE_KEY is strictly required.
    // CONTRACT_OWNER_PRIVATE_KEY is PROHIBITED as a runtime fallback.
    const canonicalRelayerKey = (process.env.RELAYER_PRIVATE_KEY || '').trim();
    const privateKey = canonicalRelayerKey || (isExplicitLocalDev ? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' : '');

    const expectedRelayerAddress = (process.env.AMOY_RELAYER_ADDRESS || process.env.RELAYER_ADDRESS || '').trim();

    return {
      mode,
      rpcUrl,
      contractAddress,
      privateKey,
      expectedChainId,
      expectedRelayerAddress,
    };
  }

  /**
   * Returns a read-only ethers Contract instance connected to the configured RPC provider.
   * Fails closed if contract address or RPC configuration is missing.
   */
  async getReadOnlyContract(): Promise<{ contract: ethers.Contract; provider: ethers.JsonRpcProvider }> {
    const config = this.getConfig();

    if (!config.rpcUrl) {
      throw new Error('[BlockchainService] Cannot initialize read-only contract: Missing RPC_URL / POLYGON_RPC_URL');
    }
    if (!config.contractAddress) {
      throw new Error('[BlockchainService] Cannot initialize read-only contract: Missing AGROTRACE_REGISTRY_ADDRESS / TRACEABILITY_CONTRACT_ADDRESS');
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, { staticNetwork: true });
    const contract = new ethers.Contract(config.contractAddress, AGROTRACE_REGISTRY_ABI, provider);
    return { contract, provider };
  }

  /**
   * Returns a signer ethers Contract instance connected via relayer wallet.
   * Validates chain ID, enforces canonical RELAYER_PRIVATE_KEY, and verifies
   * signer identity against expected relayer address before state-changing transactions.
   */
  async getSignerContract(): Promise<{ contract: ethers.Contract; provider: ethers.JsonRpcProvider; wallet: ethers.Wallet }> {
    const config = this.getConfig();

    if (!config.rpcUrl) {
      throw new Error('[BlockchainService] Cannot initialize signer contract: Missing RPC_URL / POLYGON_RPC_URL');
    }
    if (!config.contractAddress) {
      throw new Error('[BlockchainService] Cannot initialize signer contract: Missing AGROTRACE_REGISTRY_ADDRESS / TRACEABILITY_CONTRACT_ADDRESS');
    }
    if (!config.privateKey) {
      throw new Error('[BlockchainService] Cannot initialize signer contract: Missing RELAYER_PRIVATE_KEY');
    }

    // Guard: Prohibit any well-known Hardhat development private key on Amoy
    const KNOWN_DEV_KEYS = new Set([
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
      '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
      '0x47e179ec3427449b222584820a149c9229b04287d672ac477e57d94e69ddba65',
      '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
      '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d7b8d88b2366ff427d',
      '0x4bbbf856000bc11f47e7a129c4ba7044953d044e40953945c3adc671b8151cd2',
      '0xdbda1821b80551c9d65939329250298aa3472ba22fe49c395c23139fbecba596',
      '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
    ]);
    if (config.mode === 'amoy' && KNOWN_DEV_KEYS.has(config.privateKey.toLowerCase())) {
      throw new Error('[BlockchainService] Security violation: Hardhat development private key is strictly prohibited on Polygon Amoy.');
    }

    // Guard: Require explicit expected relayer address under Amoy mode
    if (config.mode === 'amoy') {
      if (!config.expectedRelayerAddress) {
        throw new Error(
          '[BlockchainService] Missing expected relayer address on Polygon Amoy. Please configure AMOY_RELAYER_ADDRESS (or RELAYER_ADDRESS).'
        );
      }
    }

    // Guard: Validate expected relayer address formatting if configured or required
    if (config.expectedRelayerAddress) {
      if (!ethers.isAddress(config.expectedRelayerAddress) || config.expectedRelayerAddress === ethers.ZeroAddress) {
        throw new Error(
          `[BlockchainService] Malformed expected relayer address: "${config.expectedRelayerAddress}" is not a valid non-zero Ethereum address.`
        );
      }
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, { staticNetwork: true });

    // Guard: Verify expected chain ID before transaction submission
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== config.expectedChainId) {
      throw new Error(
        `[BlockchainService] Chain ID mismatch: connected network has chainId ${network.chainId}, but expected ${config.expectedChainId}`
      );
    }

    const wallet = new ethers.Wallet(config.privateKey, provider);

    // Guard: Signer identity verification against explicitly configured relayer address
    if (config.expectedRelayerAddress) {
      if (wallet.address.toLowerCase() !== config.expectedRelayerAddress.toLowerCase()) {
        throw new Error(
          `[BlockchainService] Relayer address mismatch: configured expected relayer address (${config.expectedRelayerAddress}) does not match signing wallet address (${wallet.address}) derived from RELAYER_PRIVATE_KEY.`
        );
      }
    }

    const contract = new ethers.Contract(config.contractAddress, AGROTRACE_REGISTRY_ABI, wallet);

    // Mandatory Authorization Preflight: Verify that the signer holds RELAYER_ROLE on-chain
    await this.verifyRelayerAuthorization(wallet.address, contract);

    return { contract, provider, wallet };
  }

  /**
   * Preflight authorization check: Verifies on-chain in real-time that signerAddress possesses
   * RELAYER_ROLE on the registry contract before any state-changing transaction can proceed.
   * Fails closed if the contract address is missing, the role check returns false,
   * or the role query fails. Real-time preflight executed on every transaction initialization
   * to guarantee immediate detection of administrative role revocation.
   */
  async verifyRelayerAuthorization(signerAddress: string, contractInstance?: ethers.Contract): Promise<boolean> {
    const config = this.getConfig();

    if (!signerAddress || !ethers.isAddress(signerAddress) || signerAddress === ethers.ZeroAddress) {
      throw new Error(`[BlockchainService] Relayer authorization failure: Invalid signer address "${signerAddress}"`);
    }

    if (!config.contractAddress) {
      throw new Error('[BlockchainService] Relayer authorization failure: Missing AGROTRACE_REGISTRY_ADDRESS / TRACEABILITY_CONTRACT_ADDRESS');
    }

    let contract = contractInstance;
    if (!contract) {
      const { contract: readContract } = await this.getReadOnlyContract();
      contract = readContract;
    }

    let roleHash: string = RELAYER_ROLE_HASH;
    try {
      if (typeof contract.RELAYER_ROLE === 'function') {
        roleHash = await contract.RELAYER_ROLE();
      }
    } catch {
      roleHash = RELAYER_ROLE_HASH;
    }

    let hasRole: boolean;
    try {
      hasRole = await contract.hasRole(roleHash, signerAddress);
    } catch (queryErr: any) {
      throw new Error(
        `[BlockchainService] Relayer role verification failed: Unable to query RELAYER_ROLE for address ${signerAddress} on contract ${config.contractAddress}: ${queryErr?.message || queryErr}`
      );
    }

    if (!hasRole) {
      throw new Error(
        `[BlockchainService] Relayer authorization failure: Signer address (${signerAddress}) does not hold RELAYER_ROLE on contract (${config.contractAddress}). State-changing transactions rejected.`
      );
    }

    return true;
  }

  /**
   * Atomically registers a new produce batch with its initial evidence commitment on-chain.
   */
  async registerBatch(
    batchId: string,
    initialEventType: RegistryEventType | string,
    evidenceHash: string,
    originatingActor?: string,
    onBroadcast?: (txHash: string) => Promise<void>
  ): Promise<TransactionSubmissionResult> {
    const batchIdBytes32 = toBatchIdBytes32(batchId);
    const eventType = typeof initialEventType === 'number' ? initialEventType : toRegistryEventType(initialEventType);

    if (!isValidBytes32(evidenceHash)) {
      throw new Error(`[BlockchainService] Invalid evidence hash format: expected bytes32, received "${evidenceHash}"`);
    }

    const actorAddress = originatingActor && ethers.isAddress(originatingActor) ? originatingActor : ethers.ZeroAddress;

    const unlock = await this._mutex.lock();
    try {
      const { contract, wallet } = await this.getSignerContract();
      const config = this.getConfig();

      console.log(`[BlockchainService] Registering batch ${batchId} (${batchIdBytes32}) on ${config.mode} network...`);

      const tx = await contract.registerBatch(batchIdBytes32, eventType, evidenceHash, actorAddress);
      
      if (onBroadcast) {
        try {
          await onBroadcast(tx.hash);
        } catch (dbErr) {
          console.error('[BlockchainService] onBroadcast hook failed:', dbErr);
        }
      }

      const confirmations = config.mode === 'amoy' ? 3 : 1;
      const receipt = await tx.wait(confirmations);

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        batchIdBytes32,
        evidenceHash,
        metadataHash: evidenceHash,
        confirmations,
        simulated: false,
      };
    } finally {
      unlock();
    }
  }

  /**
   * Appends an authorized supply-chain trace event for an existing produce batch on-chain.
   */
  async recordEvent(
    batchId: string,
    eventTypeInput: RegistryEventType | string,
    evidenceHashOrMetadata: any,
    originatingActor?: string,
    onBroadcast?: (txHash: string) => Promise<void>
  ): Promise<TransactionSubmissionResult> {
    const batchIdBytes32 = toBatchIdBytes32(batchId);
    const eventType = typeof eventTypeInput === 'number' ? eventTypeInput : toRegistryEventType(eventTypeInput);

    if (typeof evidenceHashOrMetadata !== 'string' || !isValidBytes32(evidenceHashOrMetadata)) {
      // Caller passed raw metadata object or non-hash: route through recordEventLegacy
      const legacyResult = await this.recordEventLegacy(batchId, String(eventTypeInput), evidenceHashOrMetadata, originatingActor);
      return {
        txHash: legacyResult.txHash,
        blockNumber: 0,
        batchIdBytes32,
        evidenceHash: legacyResult.metadataHash,
        metadataHash: legacyResult.metadataHash,
        confirmations: 1,
        simulated: false,
      };
    }

    const evidenceHash = evidenceHashOrMetadata;
    const actorAddress = originatingActor && ethers.isAddress(originatingActor) ? originatingActor : ethers.ZeroAddress;

    const unlock = await this._mutex.lock();
    try {
      const { contract } = await this.getSignerContract();
      const config = this.getConfig();

      console.log(`[BlockchainService] Recording event ${eventType} for batch ${batchId} on ${config.mode} network...`);

      const tx = await contract.recordEvent(batchIdBytes32, eventType, evidenceHash, actorAddress);
      
      if (onBroadcast) {
        try {
          await onBroadcast(tx.hash);
        } catch (dbErr) {
          console.error('[BlockchainService] onBroadcast hook failed:', dbErr);
        }
      }

      const confirmations = config.mode === 'amoy' ? 3 : 1;
      const receipt = await tx.wait(confirmations);

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        batchIdBytes32,
        evidenceHash,
        metadataHash: evidenceHash,
        confirmations,
        simulated: false,
      };
    } finally {
      unlock();
    }
  }

  /**
   * Queries real transaction receipt from read-only provider without sending gas.
   */
  async getTransactionReceipt(txHash: string): Promise<ethers.TransactionReceipt | null> {
    const { provider } = await this.getReadOnlyContract();
    return await provider.getTransactionReceipt(txHash);
  }

  /**
   * Backward-compatible helper used by existing controllers (supplyChain, payment, shipment).
   * Generates deterministic hash from metadata and registers batch or records event.
   * NEVER generates simulated or fabricated hashes.
   */
  async recordEventLegacy(
    batchId: string,
    eventTypeStr: string,
    metadata: any,
    originatingActor?: string
  ): Promise<{ txHash: string; metadataHash: string; simulated: false }> {
    const metadataHash = hashEvidence(metadata);
    const eventType = toRegistryEventType(eventTypeStr);
    const batchIdBytes32 = toBatchIdBytes32(batchId);

    // Check if batch already exists on-chain
    let batchExists = false;
    try {
      const batch = await this.getBatch(batchIdBytes32);
      batchExists = batch !== null && batch.exists;
    } catch (e) {
      // If read fails, proceed to attempt recordEvent directly
    }

    let submission: TransactionSubmissionResult;
    if (!batchExists) {
      // First event for this batch: register batch atomically
      submission = await this.registerBatch(batchIdBytes32, eventType, metadataHash, originatingActor);
    } else {
      // Subsequent event: record event
      submission = await this.recordEvent(batchIdBytes32, eventType, metadataHash, originatingActor);
    }

    return {
      txHash: submission.txHash,
      metadataHash,
      simulated: false,
    };
  }

  /**
   * Read-only query: Fetch batch summary from on-chain registry.
   */
  async getBatch(batchId: string): Promise<BatchQueryResult | null> {
    const batchIdBytes32 = toBatchIdBytes32(batchId);
    const { contract } = await this.getReadOnlyContract();

    const result = await contract.getBatch(batchIdBytes32);
    if (!result || !result.exists) return null;

    return {
      batchId: result.id,
      initialEventType: Number(result.initialEventType) as RegistryEventType,
      initialEvidenceHash: result.initialEvidenceHash,
      registeredAt: new Date(Number(result.registeredAt) * 1000),
      exists: Boolean(result.exists),
      eventCount: Number(result.eventCount),
    };
  }

  /**
   * Read-only query: Fetch event count for batch.
   */
  async getEventCount(batchId: string): Promise<number> {
    const batchIdBytes32 = toBatchIdBytes32(batchId);
    const { contract } = await this.getReadOnlyContract();
    const count = await contract.getEventCount(batchIdBytes32);
    return Number(count);
  }

  /**
   * Read-only query: Fetch a specific event by index.
   */
  async getEventByIndex(batchId: string, index: number): Promise<TraceEventQueryResult | null> {
    const batchIdBytes32 = toBatchIdBytes32(batchId);
    const { contract } = await this.getReadOnlyContract();

    try {
      const evt = await contract.getEventByIndex(batchIdBytes32, index);
      return {
        eventType: Number(evt.eventType) as RegistryEventType,
        evidenceHash: evt.evidenceHash,
        timestamp: new Date(Number(evt.timestamp) * 1000),
        submitter: evt.submitter,
        originatingActor: evt.originatingActor,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Read-only query: Retrieve all events for a batch.
   */
  async getBatchEvents(batchId: string): Promise<TraceEventQueryResult[]> {
    const batchIdBytes32 = toBatchIdBytes32(batchId);
    const { contract } = await this.getReadOnlyContract();

    try {
      const events = await contract.getBatchEvents(batchIdBytes32);
      return events.map((evt: any) => ({
        eventType: Number(evt.eventType) as RegistryEventType,
        evidenceHash: evt.evidenceHash,
        timestamp: new Date(Number(evt.timestamp) * 1000),
        submitter: evt.submitter,
        originatingActor: evt.originatingActor,
      }));
    } catch (e) {
      return [];
    }
  }

  /**
   * Read-only query: Verify whether a specific commitment exists on-chain.
   */
  async verifyCommitment(
    batchId: string,
    eventType: RegistryEventType | string,
    evidenceHash: string
  ): Promise<boolean> {
    const batchIdBytes32 = toBatchIdBytes32(batchId);
    const regEventType = typeof eventType === 'number' ? eventType : toRegistryEventType(eventType);
    const { contract } = await this.getReadOnlyContract();

    try {
      return await contract.verifyCommitment(batchIdBytes32, regEventType, evidenceHash);
    } catch (e) {
      return false;
    }
  }

  /**
   * Independent on-chain verification function:
   * Recomputes expected evidence hash from normalized metadata and verifies it against
   * the on-chain smart contract commitments.
   * Returns one of 5 explicit verification states:
   * - VERIFIED: Commitment exists on-chain and hash matches.
   * - MISMATCH: Batch exists, but evidence hash does NOT match.
   * - NOT_FOUND: Batch is not registered on-chain.
   * - PENDING: Batch is in-flight or waiting for mining confirmation.
   * - UNAVAILABLE: Blockchain RPC or contract configuration is unreachable.
   */
  async verifyOnChain(
    batchId: string,
    eventType: RegistryEventType | string,
    evidenceData: any,
    pendingTxHash?: string
  ): Promise<VerificationResult> {
    const batchIdBytes32 = toBatchIdBytes32(batchId);
    const regEventType = typeof eventType === 'number' ? eventType : toRegistryEventType(eventType);
    const computedHash = hashEvidence(evidenceData);

    try {
      const batch = await this.getBatch(batchIdBytes32);

      if (!batch) {
        if (pendingTxHash) {
          return {
            status: 'PENDING',
            batchId,
            batchIdBytes32,
            onChainBatchExists: false,
            computedEvidenceHash: computedHash,
            match: false,
            transactionHash: pendingTxHash,
            details: 'Batch registration transaction is currently pending confirmation on-chain.',
          };
        }
        return {
          status: 'NOT_FOUND',
          batchId,
          batchIdBytes32,
          onChainBatchExists: false,
          computedEvidenceHash: computedHash,
          match: false,
          details: 'Produce batch has not been registered on the blockchain.',
        };
      }

      // Check commitment on-chain
      const exists = await this.verifyCommitment(batchIdBytes32, regEventType, computedHash);

      if (exists) {
        return {
          status: 'VERIFIED',
          batchId,
          batchIdBytes32,
          onChainBatchExists: true,
          computedEvidenceHash: computedHash,
          onChainEvidenceHash: computedHash,
          match: true,
          timestamp: batch.registeredAt,
          details: 'Cryptographic evidence verified against on-chain commitment.',
        };
      } else {
        return {
          status: 'MISMATCH',
          batchId,
          batchIdBytes32,
          onChainBatchExists: true,
          computedEvidenceHash: computedHash,
          match: false,
          details: 'Evidence hash mismatch: off-chain data does not match on-chain commitment.',
        };
      }
    } catch (error: any) {
      return {
        status: 'UNAVAILABLE',
        batchId,
        batchIdBytes32,
        onChainBatchExists: false,
        computedEvidenceHash: computedHash,
        match: false,
        details: `Blockchain verification unavailable: ${error?.message || error}`,
      };
    }
  }
}

export const blockchainService = new BlockchainService();
