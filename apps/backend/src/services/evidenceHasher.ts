import crypto from 'crypto';
import { ethers } from 'ethers';

/**
 * Sensitive fields that must NEVER be committed to on-chain evidence.
 * These are stripped automatically during evidence sanitization.
 */
const SENSITIVE_PII_KEYS = new Set([
  'farmername',
  'farmerphone',
  'phone',
  'email',
  'password',
  'firstname',
  'lastname',
  'exactaddress',
  'streetaddress',
  'gpslat',
  'gpslng',
  'latitude',
  'longitude',
  'price',
  'totalprice',
  'amount',
  'bankaccount',
  'accountnumber',
  'pannumber',
  'aadhaarnumber',
  'customerno',
  'shippingaddress',
]);

/**
 * Recursively canonicalizes data into a deterministic representation:
 * - Object keys are sorted lexicographically.
 * - String values are trimmed and Unicode-normalized (NFC).
 * - Date instances are serialized to standard ISO 8601 UTC strings.
 * - Undefined values and sensitive PII are excluded.
 * - Arrays preserve order, but their elements are canonicalized recursively.
 */
export function canonicalizeData(input: any): any {
  if (input === null || input === undefined) {
    return null;
  }

  if (input instanceof Date) {
    return input.toISOString();
  }

  if (typeof input === 'string') {
    return input.trim().normalize('NFC');
  }

  if (typeof input === 'number') {
    // Normalize -0 to 0
    return Object.is(input, -0) ? 0 : input;
  }

  if (typeof input === 'boolean') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(item => canonicalizeData(item));
  }

  if (typeof input === 'object') {
    const sortedKeys = Object.keys(input)
      .filter(key => {
        // Exclude undefined values and sensitive keys
        if (input[key] === undefined) return false;
        const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
        return !SENSITIVE_PII_KEYS.has(normalizedKey);
      })
      .sort();

    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      const canonicalValue = canonicalizeData(input[key]);
      if (canonicalValue !== undefined) {
        result[key] = canonicalValue;
      }
    }
    return result;
  }

  return input;
}

/**
 * Returns a canonical, deterministic JSON string representation of evidence.
 */
export function canonicalizeToJson(input: any): string {
  const canonicalObject = canonicalizeData(input);
  return JSON.stringify(canonicalObject);
}

/**
 * Computes a deterministic cryptographic SHA-256 evidence hash formatted as a bytes32 hex string.
 * @param evidence Any structured evidence payload (object, array, primitive)
 * @returns bytes32 formatted hex string ('0x' + 64 hex characters)
 */
export function hashEvidence(evidence: any): string {
  const canonicalJson = canonicalizeToJson(evidence);
  const hashHex = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
  return `0x${hashHex}`;
}

/**
 * Converts a stable business identifier (e.g. MongoDB ObjectId, SKU, or BATCH-...) into a bytes32 hex string.
 * - If already a valid 32-byte hex string (0x followed by 64 hex chars), validates and returns.
 * - Otherwise computes keccak256 hash of the stable string.
 * @param batchId Business identifier string
 * @returns bytes32 formatted hex string
 */
export function toBatchIdBytes32(batchId: string): string {
  if (!batchId || typeof batchId !== 'string' || batchId.trim() === '') {
    throw new Error('Batch ID must be a non-empty string');
  }

  const trimmed = batchId.trim();

  // If already a valid 32-byte hex string (0x + 64 hex chars)
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Deterministically hash the business identifier to bytes32
  return ethers.keccak256(ethers.toUtf8Bytes(trimmed));
}

/**
 * Validates whether a given string is a valid bytes32 hex commitment.
 */
export function isValidBytes32(value: string): boolean {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}
