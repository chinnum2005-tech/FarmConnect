import {
  canonicalizeData,
  canonicalizeToJson,
  hashEvidence,
  toBatchIdBytes32,
  isValidBytes32,
} from '../services/evidenceHasher';
import { blockchainService, RegistryEventType } from '../services/blockchain.service';

describe('Directive 044: Evidence-Hash Consistency & Canonicalization Regression Tests', () => {
  const baseEvidence = {
    batchId: 'BATCH-2026-ORGANIC-WHEAT',
    cropName: 'Golden Durum Wheat',
    cropType: 'WHEAT',
    harvestDate: '2026-10-10T12:00:00.000Z',
    moisturePercent: 12.5,
    yieldKg: 4500,
    organicCertified: true,
  };

  describe('1. Canonicalization and Property-Order Invariance', () => {
    it('produces identical SHA-256 hash regardless of object property insertion order', () => {
      const reversedOrderEvidence = {
        organicCertified: true,
        yieldKg: 4500,
        moisturePercent: 12.5,
        harvestDate: '2026-10-10T12:00:00.000Z',
        cropType: 'WHEAT',
        cropName: 'Golden Durum Wheat',
        batchId: 'BATCH-2026-ORGANIC-WHEAT',
      };

      const hash1 = hashEvidence(baseEvidence);
      const hash2 = hashEvidence(reversedOrderEvidence);

      expect(hash1).toBe(hash2);
      expect(isValidBytes32(hash1)).toBe(true);
      expect(hash1).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    it('produces identical hash for nested objects with shuffled keys', () => {
      const nestedA = {
        batchId: 'BATCH-001',
        soilData: {
          nitrogen: 45,
          phosphorus: 22,
          potassium: 88,
          ph: 6.8,
        },
        location: {
          region: 'Punjab',
          zone: 'North',
        },
      };

      const nestedB = {
        location: {
          zone: 'North',
          region: 'Punjab',
        },
        soilData: {
          ph: 6.8,
          potassium: 88,
          phosphorus: 22,
          nitrogen: 45,
        },
        batchId: 'BATCH-001',
      };

      expect(hashEvidence(nestedA)).toBe(hashEvidence(nestedB));
    });

    it('normalizes Unicode strings (NFC) and trims whitespace consistently', () => {
      const untrimmed = {
        cropName: '  Golden Durum Wheat  ',
        variety: 'Durum\u0041\u030a', // Combining ring above (A + ring)
      };

      const normalized = {
        cropName: 'Golden Durum Wheat',
        variety: 'Durum\u00c5', // Precomposed Å
      };

      expect(hashEvidence(untrimmed)).toBe(hashEvidence(normalized));
    });
  });

  describe('2. Sensitive PII Sanitization', () => {
    it('automatically strips personal and financial PII before hashing', () => {
      const evidenceWithPII = {
        ...baseEvidence,
        farmerName: 'John Doe',
        phone: '+1-555-0199',
        farmerPhone: '+1-555-0199',
        email: 'john@farm.com',
        password: 'secret_password_123',
        bankAccount: '1234567890',
        panNumber: 'ABCDE1234F',
        aadhaarNumber: '1234-5678-9012',
        gpsLat: 28.6139,
        gpsLng: 77.2090,
      };

      const cleanHash = hashEvidence(baseEvidence);
      const piiSanitizedHash = hashEvidence(evidenceWithPII);

      // PII keys are purged by evidenceHasher, resulting in identical hashes
      expect(piiSanitizedHash).toBe(cleanHash);
    });
  });

  describe('3. Tampering and Modification Detection (MISMATCH)', () => {
    it('detects single-character string changes and produces completely different hash', () => {
      const tamperedEvidence = {
        ...baseEvidence,
        cropName: 'Golden Durum WheaT', // Altered casing
      };

      const originalHash = hashEvidence(baseEvidence);
      const tamperedHash = hashEvidence(tamperedEvidence);

      expect(tamperedHash).not.toBe(originalHash);
    });

    it('detects numeric value alteration (e.g. weight / yield / moisture)', () => {
      const tamperedYield = {
        ...baseEvidence,
        yieldKg: 4501, // 1 kg modified
      };

      expect(hashEvidence(tamperedYield)).not.toBe(hashEvidence(baseEvidence));
    });

    it('detects omitted or added attributes', () => {
      const missingField: any = { ...baseEvidence };
      delete missingField.moisturePercent;

      expect(hashEvidence(missingField)).not.toBe(hashEvidence(baseEvidence));

      const extraField = {
        ...baseEvidence,
        pesticideApplied: false,
      };

      expect(hashEvidence(extraField)).not.toBe(hashEvidence(baseEvidence));
    });
  });

  describe('4. Batch Identifier Determinism', () => {
    it('deterministically hashes MongoDB ObjectID or business string to bytes32', () => {
      const mongoId = '65c5437419ecda402d98d1f0';
      const batchBytes32_1 = toBatchIdBytes32(mongoId);
      const batchBytes32_2 = toBatchIdBytes32(mongoId);

      expect(batchBytes32_1).toBe(batchBytes32_2);
      expect(isValidBytes32(batchBytes32_1)).toBe(true);
    });

    it('preserves pre-formatted 0x bytes32 strings without double-hashing', () => {
      const existingBytes32 = '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
      const output = toBatchIdBytes32(existingBytes32);

      expect(output).toBe(existingBytes32.toLowerCase());
    });
  });

  describe('5. Repeated Verification Idempotency', () => {
    it('repeated verification over 100 iterations yields bit-for-bit identical hashes', () => {
      const canonicalRef = hashEvidence(baseEvidence);
      for (let i = 0; i < 100; i++) {
        expect(hashEvidence(baseEvidence)).toBe(canonicalRef);
      }
    });
  });
});
