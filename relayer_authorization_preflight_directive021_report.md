# Project Lead Directive 021 — Amoy Relayer Authorization Preflight Report

**Date:** October 10, 2026  
**Status:** Complete & Verified Offline  
**Scope:** Runtime Signer Identity Configuration, Contract `RELAYER_ROLE` Preflight Verification, Provenance Service Parity, Offline Mocked Automated Testing, Documentation Reconciliation, and Regression Verification  

---

## 1. Executive Summary & Objective

In accordance with **Project Lead Directive 021**, the authorization gap identified during the review of Directive 020 has been resolved. The AgroTrace backend now enforces mandatory runtime signer identity configuration under Polygon Amoy testnet mode and executes a fail-closed, read-only on-chain authorization preflight check verifying that the signing wallet actually possesses the required contract role (`RELAYER_ROLE` on `AgroTraceRegistry` and `WRITER_ROLE` on `PredictionProvenance`) before any state-changing transaction can be submitted.

All implementations were developed and tested strictly offline using mocked providers and contracts. Zero public RPC endpoints were contacted, zero transactions were broadcast, zero credentials were generated or exposed, and all completed work from Directives 001–020 has been preserved.

---

## 2. Mandatory Safeguards Compliance Confirmation

| Safeguard Requirement | Verification Status | Verification Evidence |
|---|---|---|
| **Preserve existing working tree** | **CONFIRMED** | Directives 001–020 changes, reports, and patch files remain untouched. |
| **No Git commit or push** | **CONFIRMED** | Zero git commit, push, pull, merge, or rebase commands executed. |
| **No deployment** | **CONFIRMED** | No deployment to Render or any cloud service initiated; `DEPLOY_CONFIRM=false` maintained. |
| **No public RPC / transaction broadcasts** | **CONFIRMED** | All tests run offline using Jest mocks and local providers; zero public RPC requests made. |
| **No private keys or credentials exposed** | **CONFIRMED** | Zero real private keys, tokens, or secrets displayed, copied, or tracked. |
| **Do not execute `reset-passwords.js`** | **CONFIRMED** | Script was never executed. |
| **No database migrations / data changes** | **CONFIRMED** | Shared and development databases untouched; zero migrations run. |
| **Do not modify historical reports** | **CONFIRMED** | All prior audit reports (`blockchain_directive010_...` through `relayer_key_safety_directive020_report.md`) preserved intact. |

---

## 3. Files Changed and Architectural Rationale

### 3.1 `apps/backend/src/services/blockchain.service.ts`
- **Role Constant Export:** Exported `export const RELAYER_ROLE_HASH = ethers.id("RELAYER_ROLE");` (`0xe2b7fb3b832174769106533d232a97e65a4e4f9576fb6218488034aebd33f617`), corresponding to OpenZeppelin `keccak256("RELAYER_ROLE")` in `AgroTraceRegistry.sol`.
- **Mandatory Signer Identity on Amoy:** Under Amoy configuration (`mode === 'amoy'`), `expectedRelayerAddress` (`AMOY_RELAYER_ADDRESS` canonical, `RELAYER_ADDRESS` alias) is now strictly required. If missing, empty, or unconfigured, `getSignerContract()` fails closed immediately:
  `[BlockchainService] Missing expected relayer address on Polygon Amoy. Please configure AMOY_RELAYER_ADDRESS (or RELAYER_ADDRESS).`
- **Address Validation & Zero-Address Rejection:** If `expectedRelayerAddress` is provided, it is validated using `ethers.isAddress(expectedRelayerAddress)` and verified not to be `ethers.ZeroAddress`. Malformed addresses fail closed with:
  `[BlockchainService] Malformed expected relayer address: "${expectedRelayerAddress}" is not a valid non-zero Ethereum address.`
- **Signer Identity Match Assertion:** The signing wallet's derived address (`wallet.address`) is compared (case-insensitively) against `expectedRelayerAddress`. Any mismatch fails closed before transaction preparation.
- **On-Chain Authorization Preflight (`verifyRelayerAuthorization`):**
  - Added method `async verifyRelayerAuthorization(signerAddress: string, contractInstance?: ethers.Contract): Promise<boolean>`.
  - Queries the contract's read-only `hasRole(RELAYER_ROLE, signerAddress)`.
  - If `hasRole` returns `false`: Throws `[BlockchainService] Relayer authorization failure: Signer address (${signerAddress}) does not hold RELAYER_ROLE on contract (${contractAddress}). State-changing transactions rejected.`
  - If RPC read fails or contract reverts: Throws `[BlockchainService] Relayer role verification failed: Unable to query RELAYER_ROLE for address ${signerAddress} on contract ${contractAddress}: ...`.
  - Integrated into `getSignerContract()` before returning the signer instance. Because `getSignerContract()` is called by `registerBatch` and `recordEvent`, any authorization failure halts execution before transaction construction or dispatch.
- **Auditable Authorization Caching:** Successful role verifications are cached per `(chainId, contractAddress, signerAddress)` in `_verifiedRelayerCache`. If the contract address, chain ID, or signer address changes, a cache miss triggers a fresh on-chain query. Failed checks and exceptions are **never cached**. Added `clearRelayerAuthorizationCache()` for testing and dynamic role rotation.

### 3.2 `apps/backend/src/services/provenance.service.ts`
- **Role Parity for AI Subsystem:** Added `"function hasRole(bytes32 role, address account) public view returns (bool)"` and `"function WRITER_ROLE() public view returns (bytes32)"` to `PredictionProvenanceABI`.
- **Role Constant Export:** Exported `export const WRITER_ROLE_HASH = ethers.id("WRITER_ROLE");`.
- **Signer Identity & Role Preflight:** In `getContract()`, on Polygon Amoy:
  - Requires `AMOY_RELAYER_ADDRESS` (canonical) or `RELAYER_ADDRESS` (alias). Fails closed if missing, malformed, or zero address.
  - Asserts derived wallet address matches expected relayer address.
  - Executes `verifyProvenanceRole(wallet.address, contract, contractAddress)` querying `hasRole(WRITER_ROLE, wallet.address)`. Fails closed if `hasRole` returns `false` or the query reverts.
  - Implemented `clearProvenanceAuthorizationCache()` for testing and cache invalidation.

### 3.3 `apps/backend/src/__tests__/blockchain_directive021_relayer_preflight.test.ts`
- Created dedicated automated offline test suite covering all 10 required cases from Directive 021 using Jest mocks.
- Tested missing relayer private key, missing expected address, malformed address, address mismatch, `hasRole` returning false, role-query RPC failure, `hasRole` returning true with isolated mock submission, local Hardhat compatibility, and provenance service parity.
- Explicitly asserted that all rejected authorization cases result in **zero state-changing contract calls**.

### 3.4 `apps/backend/src/__tests__/blockchain_directive014_amoy_isolation.test.ts`
- Updated Test 11 with an isolated spy on `verifyRelayerAuthorization` to ensure existing isolation and configuration tests pass offline without making unmocked contract role queries.

### 3.5 Documentation & Environment Examples
- **`.env.example` & `apps/backend/.env.example`:** Documented canonical `RELAYER_PRIVATE_KEY` and `AMOY_RELAYER_ADDRESS` as mandatory for Amoy runtime, documented `RELAYER_ADDRESS` as supported fallback alias, and described the mandatory on-chain authorization preflight.
- **`Documentation/ARCHITECTURE_GUIDE.md`:** Updated Section 4 (Configure Backend Runtime) to document the runtime signer identity validation and the on-chain read-only `hasRole(RELAYER_ROLE, signerAddress)` preflight verification sequence.

---

## 4. Exact Validation Sequence Before Transaction Submission

Before any state-changing transaction (`contract.registerBatch` or `contract.recordEvent` on `AgroTraceRegistry`, or `contract.recordPredictionHash` on `PredictionProvenance`) can be constructed or submitted, the execution pipeline enforces the following strict sequence of checks:

```
[Incoming Request to registerBatch / recordEvent / anchorPrediction]
                                 │
                                 ▼
                     1. Acquire Nonce Mutex
        (Serializes in-process dispatch to prevent nonce collision)
                                 │
                                 ▼
                   2. Validate Operational Mode
         (Checks BLOCKCHAIN_NETWORK, POLYGON_CHAIN_ID, RPC URL)
                                 │
                                 ▼
             3. Enforce Amoy Signer Key Configuration
          (Checks RELAYER_PRIVATE_KEY present; rejects dev keys)
        ──[Missing Key]──> FAIL CLOSED (Zero Contract Calls)
                                 │
                                 ▼
         4. Enforce Amoy Expected Relayer Address Configuration
           (Checks AMOY_RELAYER_ADDRESS or RELAYER_ADDRESS present)
        ──[Missing Address]──> FAIL CLOSED (Zero Contract Calls)
                                 │
                                 ▼
             5. Validate Expected Relayer Address Formatting
       (Validates ethers.isAddress(...) and rejects ZeroAddress)
        ──[Malformed Address]──> FAIL CLOSED (Zero Contract Calls)
                                 │
                                 ▼
               6. Verify Expected Network Chain ID
       (Queries provider.getNetwork(); asserts chainId === 80002)
        ──[Chain Mismatch]──> FAIL CLOSED (Zero Contract Calls)
                                 │
                                 ▼
                 7. Derive Signing Wallet Address
       (Instantiates ethers.Wallet(RELAYER_PRIVATE_KEY, provider))
                                 │
                                 ▼
           8. Assert Signer Address Matches Expected Address
         (wallet.address.toLowerCase() === expectedRelayerAddress.toLowerCase())
        ──[Address Mismatch]──> FAIL CLOSED (Zero Contract Calls)
                                 │
                                 ▼
              9. Instantiate Ethers Contract Instance
      (ethers.Contract(contractAddress, AGROTRACE_REGISTRY_ABI, wallet))
                                 │
                                 ▼
             10. Authorization Preflight Cache Check
    (Checks cache: `${chainId}:${contractAddress}:${signerAddress}`)
      ├─[Cache Hit]──> Skip RPC Query ───────────────────────────────┐
      │                                                              │
      └─[Cache Miss]──> 11. Read-Only On-Chain Role Query            │
                        contract.hasRole(RELAYER_ROLE, wallet.address)│
                             │                                       │
              ┌──────────────┴──────────────┐                        │
        [Query Reverts / RPC Error]    [Query Returns false]         │
              │                              │                       │
              ▼                              ▼                       │
         FAIL CLOSED                    FAIL CLOSED                  │
    (Zero Transactions Sent)       (Zero Transactions Sent)          │
              │                              │                       │
              └──────────────┬───────────────┘                       │
                             │ [Query Returns true]                  │
                             ▼                                       │
                 12. Cache Verified Role                             │
                  (Cache updated for identity)                       │
                             │                                       │
                             ▼                                       │
           13. Return Authenticated Signer Contract <────────────────┘
                                 │
                                 ▼
              14. Dispatch State-Changing Transaction
         (contract.registerBatch / contract.recordEvent / etc.)
                                 │
                                 ▼
              15. Await On-Chain Mining Confirmations
             (Wait 3 confirmations on Amoy; 1 on Local)
                                 │
                                 ▼
                       16. Release Mutex
```

If **any** validation step from 1 through 11 fails:
- The error is thrown immediately.
- `contract.registerBatch` or `contract.recordEvent` is **never reached**.
- Zero gas is spent; zero transactions are broadcast.

---

## 5. Offline Automated Test Results & Verification

All automated test suites were executed offline with mocked providers and contracts without connecting to Polygon Amoy.

### 5.1 Test Execution Matrix

| Test Suite | File Path | Total Tests | Passed | Failed | Status |
|---|---|:---:|:---:|:---:|:---:|
| **Directive 021 Relayer Preflight Suite** | `apps/backend/src/__tests__/blockchain_directive021_relayer_preflight.test.ts` | 16 | 16 | 0 | **PASS** |
| **Directive 014 Amoy Network Isolation** | `apps/backend/src/__tests__/blockchain_directive014_amoy_isolation.test.ts` | 13 | 13 | 0 | **PASS** |
| **Directive 015 Deployment Safety Gate** | `apps/backend/src/__tests__/blockchain_directive015_safety_gate.test.ts` | 12 | 12 | 0 | **PASS** |
| **Directive 011 Backend Blockchain Integration** | `apps/backend/src/__tests__/blockchain_integration.test.ts` | 15 | 15 | 0 | **PASS** |
| **Security Containment & Invariants** | `apps/backend/src/__tests__/security_containment.test.ts` | 28 | 28 | 0 | **PASS** |
| **Hardhat Contract Test Suite** | `blockchain/test/AgroTraceRegistry.test.ts` | 23 | 23 | 0 | **PASS** |
| **Total Test Count** | **6 Suites** | **107** | **107** | **0** | **PASS** |

### 5.2 Detailed Verification of Directive 021 Required Cases

| Case | Description | Test Assertion | Result |
|:---:|---|---|:---:|
| **1** | Missing `RELAYER_PRIVATE_KEY` is rejected | `getSignerContract` & `registerBatch` reject with `Missing RELAYER_PRIVATE_KEY`; provider `call` spy confirms zero RPC calls. | **PASS** |
| **2** | Missing expected relayer address is rejected on Amoy | Rejects with `Missing expected relayer address on Polygon Amoy`; zero contract calls made. | **PASS** |
| **3** | Malformed expected address is rejected | Tested `'0xinvalid'`, `'not-an-address'`, `'0x123'`, and `ZeroAddress`; all rejected with `Malformed expected relayer address`; zero contract calls. | **PASS** |
| **4** | Mismatched signer address rejected before submission | Signer `0x1Be3...` with configured expected address `0x2222...` rejected with `Relayer address mismatch`; zero transactions submitted. | **PASS** |
| **5** | Matching signer address alone insufficient when `hasRole` returns false | Signer and expected address match, but `hasRole` returns `false`; rejected with `does not hold RELAYER_ROLE on contract`; zero state-changing calls. | **PASS** |
| **6** | Role-query failure prevents transaction submission | Simulated RPC timeout/drop during `hasRole` query; rejected with `Relayer role verification failed: Unable to query RELAYER_ROLE`; zero transactions. | **PASS** |
| **7** | `hasRole` returning true permits preflight to pass | `hasRole` evaluates `true`; preflight succeeds; isolated mock receipt returned with block number and hash; zero live network calls. | **PASS** |
| **8** | Local Hardhat behavior remains compatible | Local development (`BLOCKCHAIN_NETWORK=local`, `chainId=31337`) allows local development defaults without requiring Amoy variables. | **PASS** |
| **9** | Existing isolation & deployment tests still pass | Full regression across Directive 014 (13 tests) and Directive 015 (12 tests) passes cleanly. | **PASS** |
| **10** | Provenance service parity and safeguards | All 6 cases (10a–10f) verified for `PredictionProvenance`: missing key, missing address, malformed address, address mismatch, `hasRole(WRITER_ROLE)` returning false, and role-query error all fail closed with zero transactions submitted. | **PASS** |

### 5.3 TypeScript Build Verification
Command:
```powershell
& "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" ..\..\node_modules\typescript\bin\tsc --noEmit
```
Output:
```
Exit code: 0 (Zero errors)
```

---

## 6. Confirmation: Rejected Authorization Cases Submit Zero Transactions

A central requirement of Directive 021 is proving that rejected authorization cases never broadcast or submit partial, unauthenticated transactions.

1. **In `BlockchainService`:**
   - Both `registerBatch()` and `recordEvent()` obtain the contract instance by awaiting `this.getSignerContract()`.
   - In `getSignerContract()`, the authorization preflight (`await this.verifyRelayerAuthorization(...)`) executes **before** returning the contract object to `registerBatch` or `recordEvent`.
   - If any validation fails (key missing, expected address missing, malformed, mismatched, `hasRole` returning false, or RPC query error), `getSignerContract()` throws an exception.
   - The execution halts immediately within the service. `contract.registerBatch(...)` or `contract.recordEvent(...)` is **never invoked**.
   - Tests in `blockchain_directive021_relayer_preflight.test.ts` (Cases 1, 2, 3, 4, 5, 6) explicitly assert that contract method mocks and transaction dispatchers were called zero times.

2. **In `ProvenanceService`:**
   - `anchorPrediction()` invokes `await getContract()`.
   - On Amoy, `getContract()` enforces identical key, expected address, and `verifyProvenanceRole()` checks.
   - If any check fails, `getContract()` throws an exception.
   - `anchorPrediction()` catches the exception on Amoy and re-throws it, updating prediction status to `NOT_CONFIGURED` without calling `contract.recordPredictionHash(...)`.
   - Tests 10a through 10f confirm that zero on-chain transactions are broadcast for any rejected provenance case.

---

## 7. Remaining Limitations & Future Authorized Online Requirements

While the authorization preflight logic and fail-closed behaviors have been proven offline:

1. **Offline Scope vs. Live Blockchain:**
   - This directive was executed strictly offline without contacting Polygon Amoy or deploying contracts, in full compliance with Directive 021 safety rules.
   - Consequently, no claim is made that a live Amoy role check has succeeded against a real public testnet contract.

2. **Requirements for Future Authorized Online Milestone:**
   - When a separate directive explicitly authorizes public testnet deployment:
     1. The smart contracts (`AgroTraceRegistry.sol` and `PredictionProvenance.sol`) must be deployed to Polygon Amoy using `AMOY_DEPLOYER_PRIVATE_KEY` with `DEPLOY_CONFIRM=true`.
     2. In the deployment script, `AMOY_RELAYER_ADDRESS` must be granted `RELAYER_ROLE` on `AgroTraceRegistry`, and `WRITER_ROLE` on `PredictionProvenance`.
     3. The live backend environment must be populated with `AGROTRACE_REGISTRY_ADDRESS`, `PROVENANCE_CONTRACT_ADDRESS`, `POLYGON_RPC_URL`, `RELAYER_PRIVATE_KEY`, and `AMOY_RELAYER_ADDRESS`.
     4. During live backend startup, the authorization preflight will query the live Polygon Amoy Bor RPC node via `hasRole`, confirming end-to-end authorization before live transactions are accepted from API consumers.

---

## 8. Final Git Status & Diff Summary

### 8.1 Git Baseline & Preservation
- **Current Branch:** `main`
- **HEAD Commit:** `eea2f35fb2dfe9fd8cf7f0bc1d063b1d267135ce`
- **Prior Directives Preserved:** All completed work from Directives 001–020 is preserved intact.

### 8.2 Tracked File Modifications Summary
```
 .env.example                                    |  53 +-
 Documentation/ARCHITECTURE_GUIDE.md             |  26 +-
 apps/backend/.env.example                       |  53 +-
 apps/backend/src/services/blockchain.service.ts | 803 +++++++++++++++++++++---
 apps/backend/src/services/provenance.service.ts | 121 +++-
 5 files changed, 932 insertions(+), 124 deletions(-)
```

### 8.3 Untracked Test Additions
- `apps/backend/src/__tests__/blockchain_directive021_relayer_preflight.test.ts` (16 automated tests)
- `apps/backend/src/__tests__/blockchain_directive014_amoy_isolation.test.ts` (updated Test 11 with auth spy)

---

## 9. Explicit Safety Confirmation

We explicitly confirm that during Project Lead Directive 021:
- **NO** Git commits, pushes, merges, rebases, or destructive Git commands were executed.
- **NO** deployments to Render, AWS, Vercel, or any cloud platform were triggered.
- **NO** public RPC endpoints were contacted.
- **NO** live blockchain transactions were broadcast.
- **NO** testnet funds, faucets, or tokens were requested.
- **NO** private keys, API secrets, database credentials, or tokens were exposed.
- **NO** database migrations were executed, and `apps/backend/reset-passwords.js` was never run.
- **NO** historical audit reports were modified.

**Execution halted. Awaiting Project Lead review.**
