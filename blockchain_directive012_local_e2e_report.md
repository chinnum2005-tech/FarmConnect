# PROJECT LEAD DIRECTIVE 012 — LOCAL END-TO-END BLOCKCHAIN VERIFICATION REPORT

**Project:** AgroTrace  
**Priority:** Validate the first complete blockchain traceability flow  
**Date:** October 10, 2026  
**Mode:** Local-Only Execution & Minimal Corrective Fixes  
**Working Directory:** `C:\Users\chinn\Desktop\AgroTrace`  
**Host Node Runtime:** `C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe` (Node v24.13.0)  
**Overall Readiness Recommendation:** **READY FOR TESTNET PREPARATION**

---

## 1. Repository Baseline & Preservation Checks

### Current Git Baseline
- **Current Git Branch:** `main` (Diverged: 8 commits ahead of origin/main, 1 behind).
- **Current HEAD Commit:** `eea2f35fb2dfe9fd8cf7f0bc1d063b1d267135ce`.
- **Git Status Summary (`git status --short`):**
  - `D Documentation/atlas-credentials.env` (Staged removal from index preserved; physical file safely ignored).
  - Pre-existing uncommitted modifications preserved: `apps/backend/README.md`, `apps/backend/package.json`, `apps/backend/src/controllers/auth.controller.ts`, `apps/backend/src/controllers/order.controller.ts`, `apps/backend/src/controllers/shipment.controller.ts`, `apps/backend/src/routes/order.routes.ts`, `apps/backend/src/routes/weather.routes.ts`, `apps/backend/src/server.ts`, `apps/backend/src/services/agmarknet.service.ts`, `apps/web/src/App.tsx`, `apps/web/src/components/WeatherWidget.tsx`, `apps/web/src/pages/Login.tsx`, `apps/web/src/pages/Marketplace.tsx`, `apps/web/src/pages/WeatherIntelligence.tsx`, `blockchain/package.json`, `package-lock.json`, `package.json`, `packages/prisma/schema.prisma`, `packages/prisma/seed.ts`, `render.yaml`.
  - Directive 012 modifications:
    - Updated: `apps/backend/src/services/blockchain.service.ts` (hardened local key fallback guard; propagated RPC network errors in `getBatch`; enabled `staticNetwork: true` on providers).
    - Updated: `apps/backend/src/controllers/verify.controller.ts` (enhanced `verifyOnChainProduce` to handle direct batch payloads and typed `customEvidence: any`).
    - Updated: `blockchain/scripts/deploy.js` (deployed canonical `AgroTraceRegistry` with admin and relayer roles).
    - Updated: `blockchain/contract-address.json` (recorded deployed registry address).
    - Created: `apps/backend/src/__tests__/blockchain_local_e2e.test.ts` (15/15 passing end-to-end scenarios).
  - Safety Patches: Created pre-execution checkpoints `scratch/directive011_baseline.patch` and `scratch/directive011_staged.patch`.
- **Preservation Compliance:**
  - Zero destructive Git operations (`reset`, `clean`, `checkout --`, `rebase`).
  - Zero commits, pushes, or public network broadcasts.
  - Zero secrets or private keys printed in logs, console outputs, or reports.
  - Zero connection to shared MongoDB Atlas database (`apps/backend/reset-passwords.js` not run).
  - `services/blockchain/SupplyChain.sol` and `services/blockchain/PredictionProvenance.sol` preserved untouched.

---

## 2. Local Network & Contract Deployment Details

### Local EVM Environment
- **RPC Host & Port:** `http://127.0.0.1:8545` (Hardhat JSON-RPC node running locally).
- **Network Name:** `localhost`.
- **Chain ID:** `31337` (`0x7a69`).
- **Contract Name:** `AgroTraceRegistry` (`blockchain/contracts/AgroTraceRegistry.sol`).
- **Contract Address:** `0x5FbDB2315678afecb367f032d93F642f64180aa3`.
- **Deployer / Admin Account:** `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Hardhat Signer #0).
- **Relayer Account:** `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Granted `RELAYER_ROLE`).
- **Role Assignment:**
  - `DEFAULT_ADMIN_ROLE`: Granted to `0xf39Fd6...`
  - `PAUSER_ROLE`: Granted to `0xf39Fd6...`
  - `RELAYER_ROLE`: Granted to `0xf39Fd6...`
- **Address File (`blockchain/contract-address.json`):**
  ```json
  {
    "AgroTraceRegistry": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "Traceability": "0x5FbDB2315678afecb367f032d93F642f64180aa3"
  }
  ```

---

## 3. Test Environment & Isolated Persistence Method

- **Blockchain Isolation:** Executed against an isolated local Hardhat node in memory. All state changes exist only in local node memory and do not touch external ledgers.
- **Synthetic Test Batches:** Every test run uses uniquely generated batch identifiers:
  - `BATCH-E2E-2026-<timestamp>`
  - `BATCH-CONC-E2E-<timestamp>`
- **Database Boundary:** No shared MongoDB instance was connected. Controller tests utilize mock Express request/response harnesses that verify route matching, payload parsing, and direct integration with the running blockchain service.

---

## 4. End-to-End Scenario Execution Results

### Scenario A — Register a Batch
- **Action:** Registered produce batch `BATCH-E2E-2026-1791572737462` with initial stage `PLANTED` (0), synthetic organic wheat evidence, and attested originating actor `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`.
- **Transaction Receipt:**
  - `txHash`: `0xcb4fb144b726ea39fae1162c208743ff1e401522e3863c6591311a12c83838d8`
  - `blockNumber`: Block 1
  - `confirmations`: 1
  - `simulated`: `false`
  - EVM status: `1` (Success confirmed directly via `provider.getTransactionReceipt`)
- **On-Chain State:**
  - `getBatch` confirmed `exists: true`, `eventCount: 1`, `initialEventType: 0`.
  - Initial evidence commitment at event index 0 matches the SHA-256 evidence hash.
  - Submitter truthfully recorded as relayer `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`.

### Scenario B — Append Trace Events
- **Action:** Appended two subsequent chronological trace events to the batch:
  1. `HARVESTED` (1): Yield `4500 kg`, moisture `12.4%`, operator `OPERATOR-42`.
  2. `QUALITY_CHECK` (6): Grade `GRADE_A_PREMIUM`, protein `14.2%`, lab QC approval.
- **On-Chain State:**
  - Both transactions confirmed on-chain with distinct real local transaction receipts.
  - `getEventCount(batchId)` returned `3`.
  - `getEventByIndex(batchId, 1)` confirmed `HARVESTED` with matching evidence hash.
  - `getEventByIndex(batchId, 2)` confirmed `QUALITY_CHECK` with matching evidence hash.
  - `getBatchEvents(batchId)` returned all 3 chronological events in sequence.
  - **Honest Attribution:** Submitter recorded as relayer account; contract did not claim cryptographic signature verification for the originating actor.

### Scenario C — Verify Genuine Evidence
- **Verification Calls:**
  - Initial planting evidence -> `status: 'VERIFIED'`, `match: true`, `onChainBatchExists: true`.
  - Harvest evidence -> `status: 'VERIFIED'`, `match: true`.
  - Quality inspection evidence -> `status: 'VERIFIED'`, `match: true`.
  - **Property-Order Invariance:** Shuffled object keys of harvest evidence returned `status: 'VERIFIED'`, `match: true`, demonstrating that normalization is independent of JSON key ordering.

### Scenario D — Reject Tampered Evidence & Honest Error States
- **Tampered Evidence:** Changed single field in off-chain harvest evidence (`moisturePercent: 19.8` vs recorded `12.4%`).
  - Result: `status: 'MISMATCH'`, `match: false`, `onChainBatchExists: true`.
  - Alert: `"Evidence hash mismatch: off-chain data does not match on-chain commitment."`
- **Nonexistent Batch:** Querying unrecorded batch ID `BATCH-GHOST-...`.
  - Result: `status: 'NOT_FOUND'`, `match: false`, `onChainBatchExists: false`.
  - Alert: `"Produce batch has not been registered on the blockchain."`
- **Missing Configuration:** When `AGROTRACE_REGISTRY_ADDRESS` or RPC is missing:
  - Result: `status: 'UNAVAILABLE'`, `match: false`.
  - Alert: `"Blockchain verification unavailable: Missing AGROTRACE_REGISTRY_ADDRESS"`.
- **Network Refusal:** When RPC server is unreachable (`ECONNREFUSED`):
  - Result: `status: 'UNAVAILABLE'`, `match: false`.
  - Alert: `"Blockchain verification unavailable: connect ECONNREFUSED 127.0.0.1:8545"`.

### Scenario E — Retry, Duplicate Prevention & Concurrency
- **Duplicate Registration:** Attempting `registerBatch` again for the same batch ID reverted with EVM error `"Batch already registered"`.
- **Duplicate Commitment:** Attempting `recordEvent` with duplicate `(batchId, HARVESTED, evidenceHash)` reverted with `"Duplicate event commitment"`.
- **Concurrency Serialization:** 3 distinct events dispatched concurrently via `Promise.all` were serialized through `NonceMutex`. All 3 succeeded without nonce collision (`NONCE_EXPIRED`) and produced 4 total on-chain events.
- **Pending Transaction State:** Provided in-flight `pendingTxHash` for an unmined batch:
  - Result: `status: 'PENDING'`, `match: false`, `onChainBatchExists: false`.

### Scenario F — API and Persistence Compatibility
- **Endpoint `/api/v1/verify/on-chain/:identifier`:**
  - Tested with genuine harvest evidence: returned HTTP 200 with `data.status: "VERIFIED"`, `data.match: true`.
  - Tested with tampered evidence: returned HTTP 200 with `data.status: "MISMATCH"`, `data.match: false`.
- **Existing QR Route `/api/v1/verify/:qrCode`:**
  - Preserved existing database history lookup for consumer scans.
  - Nonexistent QR codes return HTTP 404 AppError cleanly without crashing.

---

## 5. Transaction Receipts & Event Index Verification Record

| Event Index | Event Type | Stage Code | Evidence Hash | Submitter (Relayer) | Originating Actor | Local Block |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **0** | `PLANTED` | 0 | `0x19ca...583b` | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | 1 |
| **1** | `HARVESTED` | 1 | `0x8bfb...d592` | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | 2 |
| **2** | `QUALITY_CHECK` | 6 | `0x4896...1938` | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | 3 |

---

## 6. Exact Test Commands & Execution Results

### 1. Hardhat Smart Contract Suite (`AgroTraceRegistry.test.ts`)
```powershell
& "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" node_modules/hardhat/internal/cli/bootstrap.js test test/AgroTraceRegistry.test.ts
```
```text
  AgroTraceRegistry
    1. Deployment & Role Setup
      √ Should correctly initialize DEFAULT_ADMIN_ROLE and PAUSER_ROLE to admin
      √ Should correctly initialize RELAYER_ROLE to relayer
      √ Should revert if admin or relayer is zero address
    2. Batch Registration (Requirement 1, 2, 4, 15)
      √ Authorized batch registration succeeds with atomic initial event (54ms)
      √ Rejects zero batchId or zero evidenceHash (Requirement 4)
      √ Duplicate batch registration reverts (Requirement 3)
      √ Unauthorized registration is rejected (Requirement 5)
    3. Supply Chain Event Recording (Requirement 6, 7, 8, 9, 10)
      √ Valid events can be appended to an existing batch (Requirement 7)
      √ Unauthorized event recording is rejected (Requirement 6)
      √ Events cannot be appended to nonexistent batches (Requirement 8)
      √ Zero evidence hash is rejected in recordEvent (Requirement 4)
      √ Duplicate logical event commitments are rejected (Requirement 9)
      √ Distinct legitimate events of the same eventType are accepted (Requirement 10)
      √ Full supply-chain progression succeeds across all stages
    4. Emergency Pause & Controlled Unpause (Requirement 11, 12, 13)
      √ Only authorized pauser can pause and unpause (Requirement 12) (60ms)
      √ Pause blocks state-changing operations (Requirement 11)
      √ Unpause restores normal operations (Requirement 13)
    5. Query Interface, Pagination & Read Idempotency (Requirement 14, 16)
      √ Event counts and indexed queries are correct (Requirement 14)
      √ getBatchEvents returns complete event array
      √ verifyCommitment returns false for unrecorded commitments
      √ Repeated reads do not change state (Requirement 16) (41ms)
    6. State Rollback & Atomicity on Failure (Requirement 17)
      √ Failed registration leaves no partial batch or event state
      √ Failed event recording leaves existing batch state untouched

  23 passing (1s)
```

### 2. Backend Local End-to-End Suite (`blockchain_local_e2e.test.ts`)
```powershell
& "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" ../../node_modules/jest/bin/jest.js src/__tests__/blockchain_local_e2e.test.ts --preset ts-jest
```
```text
PASS src/__tests__/blockchain_local_e2e.test.ts
  Directive 012: Local End-to-End Blockchain Verification Suite
    Scenario A — Register a produce batch on local chain
      √ anchors the batch with initial evidence commitment and receives a real receipt (253 ms)
    Scenario B — Append subsequent trace events to the batch
      √ appends HARVESTED and QUALITY_CHECK events on-chain with truthful attribution (295 ms)
    Scenario C — Verify genuine off-chain evidence against contract commitments
      √ returns VERIFIED when recomputed evidence hash matches on-chain commitment (133 ms)
      √ remains VERIFIED even if property ordering is shuffled in off-chain evidence (31 ms)
    Scenario D — Reject tampered evidence and distinguish error states
      √ returns MISMATCH when a single field in off-chain evidence has been altered (31 ms)
      √ returns NOT_FOUND when querying a batch that has never been registered on-chain (21 ms)
      √ returns UNAVAILABLE when contract address or RPC configuration is absent (2 ms)
      √ returns UNAVAILABLE when the RPC network connection refuses connection (1 ms)
    Scenario E — Retry, duplicate prevention and concurrency behavior
      √ reverts when attempting to register an already-registered batch ID (61 ms)
      √ reverts when attempting to record a duplicate event commitment on the same batch (51 ms)
      √ safely serializes concurrent event submissions without nonce collision (416 ms)
      √ returns PENDING when a transaction hash is provided for an in-flight submission (15 ms)
    Scenario F — Controller routes, API shapes and persistence compatibility
      √ executes verifyOnChainProduce HTTP controller handler for verified on-chain batch (686 ms)
      √ executes verifyOnChainProduce HTTP controller handler for tampered evidence (135 ms)
      √ existing QR verification route safely returns 404 for nonexistent produce QR codes (56 ms)

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
Snapshots:   0 total
Time:        4.765 s
```

### 3. Full Backend Jest Test Suite (`src/__tests__`)
```powershell
& "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" ../../node_modules/jest/bin/jest.js src/__tests__ --preset ts-jest
```
```text
PASS src/__tests__/security_containment.test.ts (28 passed)
PASS src/__tests__/blockchain_integration.test.ts (15 passed)
PASS src/__tests__/blockchain_local_e2e.test.ts (15 passed)

Test Suites: 3 passed, 3 total
Tests:       58 passed, 58 total
Snapshots:   0 total
Time:        6.661 s
```

### 4. Backend TypeScript Compilation
```powershell
& "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" ../../node_modules/typescript/bin/tsc --noEmit
```
**Exit Code:** `0` (Zero compiler errors).

### 5. Frontend Production Build
```powershell
& "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" node_modules/vite/bin/vite.js build
```
```text
✓ built in 8.31s
dist/index.html                       2.13 kB │ gzip:   0.88 kB
dist/assets/index-Bju7LEJF.css      107.85 kB │ gzip:  20.20 kB
dist/assets/index.es-Z6hUZJx-.js    150.69 kB │ gzip:  51.55 kB
dist/assets/index-DtoSU4fc.js     2,007.71 kB │ gzip: 584.72 kB
```
**Exit Code:** `0` (Built successfully).

---

## 7. Bugs Discovered & Fixes Applied

1. **Security Guard: Restricted Local Private Key Fallback:**
   - *Discovery:* Previously, if `BLOCKCHAIN_NETWORK` was not explicitly `'amoy'`, `getConfig()` defaulted to `'local'` and could offer the Hardhat test key even if a non-local chain ID or public RPC URL was configured.
   - *Fix:* Enforced `isExplicitLocalDev`: requires `mode === 'local'`, `!isAmoyConfigured`, `expectedChainId === 31337 || 1337`, `rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost')`, and `process.env.NODE_ENV !== 'production'`. Any other environment requires an explicit secret or fails closed.
2. **Truthful Error Distinction (`UNAVAILABLE` vs `NOT_FOUND`):**
   - *Discovery:* `getBatch()` in `blockchain.service.ts` previously had a generic `try/catch` returning `null`, which caused RPC network disconnections (`ECONNREFUSED`) to report `NOT_FOUND` instead of `UNAVAILABLE`.
   - *Fix:* Allowed RPC and network connection errors to propagate to `verifyOnChain()`, which catches them and truthfully reports `status: 'UNAVAILABLE'`.
3. **Legacy Deployment Script:**
   - *Discovery:* `blockchain/scripts/deploy.js` was still targeting the deprecated `Traceability` contract.
   - *Fix:* Updated `deploy.js` to deploy `AgroTraceRegistry` with deployer as admin and relayer, writing addresses to `contract-address.json`.
4. **Standalone Batch Verification Payload:**
   - *Discovery:* `verifyOnChainProduce` in `verify.controller.ts` only supported `{ id: identifier }` for batches not found in the DB.
   - *Fix:* Added support for client-provided evidence payloads via `req.body.evidence` or `req.query.evidence`, and typed `customEvidence: any` to eliminate TypeScript errors.
5. **Ethers v6 Lingering Timers:**
   - *Discovery:* On unreachable URLs, Ethers v6 JsonRpcProvider background retries caused Jest open handle warnings.
   - *Fix:* Configured `{ staticNetwork: true }` on JsonRpcProvider instantiations.

---

## 8. Persistence Analysis & Proposed Schema Extensions

### Current Prisma Model Analysis
In `packages/prisma/schema.prisma`:
```prisma
model SupplyChainEvent {
  id              String    @id @default(auto()) @map("_id") @db.ObjectId
  productId       String?   @db.ObjectId
  eventType       EventType
  timestamp       DateTime
  location        String?
  actorId         String    @db.ObjectId
  cropId          String?   @db.ObjectId
  metadata        String?   // Additional JSON data
  transactionHash String?   @unique // Blockchain transaction hash
  chainStatus     String?   @default("PENDING") // PENDING, CONFIRMED, FAILED
  blockNumber     Int?
  verified        Boolean   @default(false)
  createdAt       DateTime  @default(now())
}
```

### Finding
Because `transactionHash` is `@unique`, multiple in-flight events cannot safely share a placeholder like `"pending"`. Storing `null` is supported by MongoDB sparse indexes, but in-flight submissions with pending transactions require clean lifecycle representation.

### Minimal Recommended Extension (For Future Separately Authorized Directive)
```prisma
model SupplyChainEvent {
  // Existing fields...
  transactionHash String?   // Remove @unique or keep sparse for mined hashes
  pendingTxHash   String?   // Broadcast hash awaiting block inclusion
  chainStatus     String?   @default("RECORDED_DB") // RECORDED_DB, SUBMITTED, IN_BLOCK, CONFIRMED, FAILED
  confirmations   Int?      @default(0)
  evidenceHash    String?   // 32-byte hex hash committed to contract
  batchIdBytes32  String?   // Canonical bytes32 batch identifier
}
```
*Zero database migrations or schema alterations were executed in this directive.*

---

## 9. Deployment Boundary Confirmation

- **No Public Network Transactions:** All operations were executed exclusively against the local Hardhat node on `127.0.0.1:8545`.
- **No Testnet Deployments:** Polygon Amoy was neither connected to nor deployed to.
- **No Faucet Requests:** No testnet POL was requested.
- **No Production Secrets:** No real wallet private keys or production credentials were generated or exposed.

---

## 10. Final Recommendation

**Recommendation:** **`READY FOR TESTNET PREPARATION`**

The entire end-to-end blockchain traceability flow—from batch registration and multi-stage event recording to deterministic canonical hashing, honest relayer attribution, and independent cryptographic verification—is fully operational, verified, and passing 100% of local automated tests.

*All execution has stopped per directive instructions. Awaiting Project Lead review before commencing any testnet deployment milestone.*
