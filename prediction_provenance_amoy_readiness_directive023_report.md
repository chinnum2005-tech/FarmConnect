# PROJECT LEAD DIRECTIVE 023 — PREDICTION PROVENANCE AMOY DEPLOYMENT READINESS REPORT

**Date:** 2026-10-10  
**Status:** COMPLETE & VERIFIED (OFFLINE TOOLING & TESTS)  
**Safety Gate:** ZERO PUBLIC DEPLOYMENT | ZERO PUBLIC RPC CALLS | ZERO TRANSACTION BROADCASTS | ZERO COMMITS | ZERO DATABASE CHANGES  
**Target Contracts:** `PredictionProvenance.sol` (AI Prediction Provenance) & `AgroTraceRegistry.sol` (Traceability Registry)  
**Primary Tooling & Tests Audited:**  
- [services/blockchain/scripts/deploy-provenance.ts](file:///c:/Users/chinn/Desktop/AgroTrace/services/blockchain/scripts/deploy-provenance.ts) (New Amoy deployment tooling)
- [services/blockchain/hardhat.config.ts](file:///c:/Users/chinn/Desktop/AgroTrace/services/blockchain/hardhat.config.ts) (Amoy & Localhost network configuration)
- [services/blockchain/test/PredictionProvenanceAmoyDeploy.test.ts](file:///c:/Users/chinn/Desktop/AgroTrace/services/blockchain/test/PredictionProvenanceAmoyDeploy.test.ts) (New Hardhat integration tests)
- [apps/backend/src/services/provenance.service.ts](file:///c:/Users/chinn/Desktop/AgroTrace/apps/backend/src/services/provenance.service.ts) (Reconciled address resolution & chain ID checks)
- [apps/backend/src/__tests__/blockchain_directive023_provenance_deployment.test.ts](file:///c:/Users/chinn/Desktop/AgroTrace/apps/backend/src/__tests__/blockchain_directive023_provenance_deployment.test.ts) (New offline Jest safety gate tests)

---

## 1. Deployment and Role-Assignment Design

### 1.1 Architectural Problem & Contract Constructor Analysis
Inspection of [services/blockchain/contracts/PredictionProvenance.sol](file:///c:/Users/chinn/Desktop/AgroTrace/services/blockchain/contracts/PredictionProvenance.sol) established that the contract's constructor assigns all initial privileges exclusively to `msg.sender`:

```solidity
constructor() {
    owner = msg.sender;
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _grantRole(WRITER_ROLE, msg.sender);
    _grantRole(PAUSER_ROLE, msg.sender);
}
```

In a production or testnet environment where roles must be strictly separated:
1. The **Deployer** account (`AMOY_DEPLOYER_PRIVATE_KEY`) executes the contract creation transaction and pays gas.
2. The **Relayer** account (`AMOY_RELAYER_ADDRESS`) must possess `WRITER_ROLE` to sign and anchor crop prediction hashes via `recordPredictionHash()`.
3. The **Administrator** account (`AMOY_ADMIN_ADDRESS`) must possess `DEFAULT_ADMIN_ROLE` and `PAUSER_ROLE` to manage access control and pause the contract during emergencies.
4. The **Deployer** must **NOT** retain permanent administrative or operational privileges on the deployed contract, as leaving a deployment account with persistent admin rights creates an unmonitored backdoor.

### 1.2 Solidity Source-Level Finding: `owner` vs `AccessControl`
Inspection of `PredictionProvenance.sol` revealed:
- `address public owner` is set to `msg.sender` in the constructor.
- A modifier `modifier onlyOwner() { require(msg.sender == owner || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not owner"); _; }` is defined in the contract.
- **Critical Finding:** `onlyOwner` is **NEVER applied** to any function in `PredictionProvenance.sol`.
- All operational and emergency state-changing functions are protected strictly by OpenZeppelin's `AccessControl`:
  - `recordPredictionHash()`: protected by `whenNotPaused onlyRole(WRITER_ROLE) nonReentrant`
  - `pause()`: protected by `onlyRole(PAUSER_ROLE)`
  - `unpause()`: protected by `onlyRole(PAUSER_ROLE)`
  - Role management (`grantRole`, `revokeRole`, `renounceRole`): governed by `DEFAULT_ADMIN_ROLE`.

Because `owner` confers zero privileges once roles are transferred, **no modification to the Solidity contract source is required**. Safe administrative handover is executed entirely on-chain via OpenZeppelin's standard `grantRole` and `renounceRole` functions, preserving complete backward compatibility with legacy tests and bytecode.

### 1.3 Role Assignment & Handover Design
The deployment script [deploy-provenance.ts](file:///c:/Users/chinn/Desktop/AgroTrace/services/blockchain/scripts/deploy-provenance.ts) executes the following sequence:
1. **Contract Deployment:** Deployer creates `PredictionProvenance`.
2. **Grant Relayer Role:** Deployer calls `grantRole(WRITER_ROLE, AMOY_RELAYER_ADDRESS)`.
3. **Grant Admin Role:** Deployer calls `grantRole(DEFAULT_ADMIN_ROLE, AMOY_ADMIN_ADDRESS)`.
4. **Grant Pauser Role:** Deployer calls `grantRole(PAUSER_ROLE, AMOY_ADMIN_ADDRESS)`.
5. **On-Chain Verification:** Deployer queries `hasRole` for all 3 grants; fails closed if any is false.
6. **Deployer Role Renunciation (Administrative Handover):** If the deployer is not the admin:
   - Deployer calls `renounceRole(WRITER_ROLE, deployer.address)`
   - Deployer calls `renounceRole(PAUSER_ROLE, deployer.address)`
   - Deployer calls `renounceRole(DEFAULT_ADMIN_ROLE, deployer.address)`
7. **Post-Handover Verification:** Script queries the contract to verify:
   - `deployer.address` holds `0` privileged roles.
   - `AMOY_ADMIN_ADDRESS` holds `DEFAULT_ADMIN_ROLE` and `PAUSER_ROLE`.
   - `AMOY_RELAYER_ADDRESS` holds `WRITER_ROLE`.

---

## 2. Files Changed and Rationale

| File Path | Action | Rationale |
|---|---|---|
| [services/blockchain/hardhat.config.ts](file:///c:/Users/chinn/Desktop/AgroTrace/services/blockchain/hardhat.config.ts) | Modified | Added workspace root `.env` loading, `localhost` (chainId 31337), and Polygon Amoy (chainId 80002) network configuration using `AMOY_DEPLOYER_PRIVATE_KEY` and polygonAmoy block explorer custom chain config. |
| [services/blockchain/package.json](file:///c:/Users/chinn/Desktop/AgroTrace/services/blockchain/package.json) | Modified | Added `"deploy:local"` and `"deploy:amoy"` scripts pointing to `deploy-provenance.ts`. |
| [services/blockchain/scripts/deploy-provenance.ts](file:///c:/Users/chinn/Desktop/AgroTrace/services/blockchain/scripts/deploy-provenance.ts) | **Created** | Comprehensive deployment script for `PredictionProvenance` featuring pre-flight validation guards, role separation enforcement, administrative handover, network-scoped address persistence, and offline dry-run gating. |
| [services/blockchain/test/PredictionProvenanceAmoyDeploy.test.ts](file:///c:/Users/chinn/Desktop/AgroTrace/services/blockchain/test/PredictionProvenanceAmoyDeploy.test.ts) | **Created** | Hardhat unit/integration tests verifying deployment, role assignment, relayer execution, unauthorized account rejection, pause/unpause permissions, and deployer privilege stripping. |
| [apps/backend/src/services/provenance.service.ts](file:///c:/Users/chinn/Desktop/AgroTrace/apps/backend/src/services/provenance.service.ts) | Modified | Reconciled runtime contract address resolution to check network-isolated sections in `contract-address.json` and `deployment-info.json`, normalized placeholder zero addresses, added local Hardhat dev address rejection on Amoy, and enforced `network.chainId === 80002` verification in Amoy mode. |
| [apps/backend/src/__tests__/blockchain_directive023_provenance_deployment.test.ts](file:///c:/Users/chinn/Desktop/AgroTrace/apps/backend/src/__tests__/blockchain_directive023_provenance_deployment.test.ts) | **Created** | 9 offline unit tests verifying deployment safety gates: signer requirement, address validation, zero address rejection, dev account prohibition, role separation, mainnet rejection, dry-run gating, WRITER_ROLE parity, and local dev address rejection on Amoy. |

---

## 3. Exact Role-Grant and Administrative-Handover Sequence

The exact sequence executed by [deploy-provenance.ts](file:///c:/Users/chinn/Desktop/AgroTrace/services/blockchain/scripts/deploy-provenance.ts) is detailed below:

```mermaid
sequenceDiagram
    autonumber
    participant D as Deployer (AMOY_DEPLOYER)
    participant C as PredictionProvenance Contract
    participant A as Admin (AMOY_ADMIN)
    participant R as Relayer (AMOY_RELAYER)

    Note over D,C: Contract Creation Phase
    D->>C: deploy()
    C-->>D: Deployed (Deployer has ADMIN, WRITER, PAUSER)

    Note over D,C: Role Grant Phase
    D->>C: grantRole(WRITER_ROLE, AMOY_RELAYER)
    D->>C: grantRole(DEFAULT_ADMIN_ROLE, AMOY_ADMIN)
    D->>C: grantRole(PAUSER_ROLE, AMOY_ADMIN)

    Note over D,C: Pre-Handover Verification
    D->>C: hasRole(WRITER_ROLE, R) == true
    D->>C: hasRole(ADMIN_ROLE, A) == true
    D->>C: hasRole(PAUSER_ROLE, A) == true

    Note over D,C: Administrative Handover Phase
    D->>C: renounceRole(WRITER_ROLE, D)
    D->>C: renounceRole(PAUSER_ROLE, D)
    D->>C: renounceRole(DEFAULT_ADMIN_ROLE, D)

    Note over D,C: Post-Handover Verification
    D->>C: hasRole(ADMIN_ROLE, D) == false
    D->>C: hasRole(WRITER_ROLE, D) == false
    D->>C: hasRole(PAUSER_ROLE, D) == false
    D->>C: hasRole(ADMIN_ROLE, A) == true (Admin retained)
```

### Privileges After Successful Handover:
- **`AMOY_ADMIN_ADDRESS`:** Holds `DEFAULT_ADMIN_ROLE` and `PAUSER_ROLE`. Can pause/unpause and grant/revoke roles. Does **NOT** hold `WRITER_ROLE`.
- **`AMOY_RELAYER_ADDRESS`:** Holds `WRITER_ROLE`. Can call `recordPredictionHash()`. Does **NOT** hold `DEFAULT_ADMIN_ROLE` or `PAUSER_ROLE`.
- **`AMOY_DEPLOYER_PRIVATE_KEY` (Deployer Wallet):** Holds **ZERO** roles (`hasRole` returns false for Admin, Writer, and Pauser).

---

## 4. Tests Run, Pass/Fail Counts, and Skipped Suites

All tests were executed locally and offline. No public RPC endpoints or live blockchain networks were contacted.

### 4.1 Test Execution Results

| Test Suite / Command | Location / Runner | Tests Passed | Tests Failed | Execution Time |
|---|---|:---:|:---:|:---:|
| `npx hardhat test` | `services/blockchain/` (Hardhat) | **23** | **0** | 1.00 s |
| ↳ *PredictionProvenanceAmoyDeploy.test.ts* | *(Directive 023 Deployment & Handover)* | *6* | *0* | *0.25 s* |
| ↳ *PredictionProvenance.test.ts* | *(Legacy Provenance Contract Tests)* | *5* | *0* | *0.20 s* |
| ↳ *SupplyChain.test.ts* | *(Legacy SupplyChain Contract Tests)* | *12* | *0* | *0.55 s* |
| `npx hardhat test test/AgroTraceRegistry.test.ts` | `blockchain/` (Hardhat) | **23** | **0** | 1.00 s |
| `npx jest src/__tests__/blockchain_directive023_provenance_deployment.test.ts --forceExit` | `apps/backend/` (Jest) | **9** | **0** | 2.34 s |
| `npx jest src/__tests__/blockchain_directive021_relayer_preflight.test.ts --forceExit` | `apps/backend/` (Jest) | **17** | **0** | 2.43 s |
| `npx jest src/__tests__/blockchain_directive014_amoy_isolation.test.ts --forceExit` | `apps/backend/` (Jest) | **13** | **0** | 2.60 s |
| `npx jest src/__tests__/blockchain_directive015_safety_gate.test.ts --forceExit` | `apps/backend/` (Jest) | **12** | **0** | 2.32 s |
| `npx jest src/__tests__/blockchain_integration.test.ts --forceExit` | `apps/backend/` (Jest) | **15** | **0** | 2.78 s |
| `npx jest src/__tests__/security_containment.test.ts --forceExit` | `apps/backend/` (Jest) | **28** | **0** | 3.13 s |
| `npx tsc --noEmit` | `apps/backend/` (TypeScript Build) | **0 errors** | **0 warnings** | 4.25 s |

**Total Tests Run & Passed:** **140 passed across 8 test suites; 0 failed.**  
**Backend TypeScript Build:** Clean compilation with zero errors or warnings.

### 4.2 Skipped Suites
- `blockchain_lifecycle_persistence.test.ts` and `blockchain_local_e2e.test.ts` were skipped as they require an actively running local Hardhat daemon listening at `http://127.0.0.1:8545`. Per Directive 023 mandatory safety rules, no background daemons or external processes were started.

---

## 5. Offline Dry-Run Results and Public Network Isolation

### 5.1 Dry-Run Preflight Verification
When executed targeting Polygon Amoy (`--network amoy` or chain ID 80002) without `DEPLOY_CONFIRM=true`, the deployment tooling halts before broadcasting:

```text
==================================================================
PredictionProvenance Deployment Tooling
Detected Network: amoy (Chain ID: 80002)
==================================================================
Deployer Account: 0x1111111111111111111111111111111111111111
Target Admin Role:   0x2222222222222222222222222222222222222222
Target Relayer Role: 0x3333333333333333333333333333333333333333
Compiled Bytecode Verified: 3223 bytes (ABI and factory validated)
------------------------------------------------------------------
DRY-RUN READINESS CHECK COMPLETED SUCCESSFULLY.
Contract bytecode, compiler configuration, and role targets verified.
DEPLOYMENT HALTED: Testnet transaction broadcasting is NOT authorized.
To execute live deployment in a separately authorized milestone, set DEPLOY_CONFIRM=true.
==================================================================
```

### 5.2 Network Isolation Invariants Confirmed:
1. **Zero Transaction Broadcasting:** Dry-run exits with status `DRY_RUN_HALTED`. Exactly zero transactions are signed or sent to any mempool.
2. **Rejection of Known Dev Accounts on Amoy:** Any use of standard Hardhat test accounts (`0xf39fd6e...`, `0x709979...`) for Deployer, Admin, or Relayer on Amoy throws a `Security violation` and halts immediately.
3. **Role Separation on Amoy:** Attempts to reuse the Deployer as Relayer or Admin, or reuse Admin as Relayer, are rejected before transaction encoding.
4. **Network-Scoped Address Persistence:** Contract addresses for Amoy are saved strictly under the `"80002"` key in `services/blockchain/deployment-info.json` and `blockchain/contract-address.json`, ensuring local `"31337"` development addresses cannot be overwritten.

---

## 6. Remaining Blockers Before a Separately Authorized Deployment

Before an actual public testnet deployment to Polygon Amoy can take place under a future directive, the following items must be resolved:

1. **Account Provisioning:**
   - A dedicated deployer account funded with testnet MATIC/POL on Polygon Amoy must be created and set as `AMOY_DEPLOYER_PRIVATE_KEY`.
   - A dedicated administrator account must be established and set as `AMOY_ADMIN_ADDRESS`.
   - A dedicated relayer account must be funded and set as `AMOY_RELAYER_ADDRESS` and `RELAYER_PRIVATE_KEY`.
2. **Explicit Project Lead Authorization:**
   - Deployment remains strictly disabled until `DEPLOY_CONFIRM=true` is provided.
3. **Live RPC Verification:**
   - Live RPC responsiveness and gas fee parameters on Polygon Amoy must be verified in an authorized online check.
4. **Environment Propagation:**
   - Once deployed, the resulting on-chain contract address must be set as `PROVENANCE_CONTRACT_ADDRESS` on Render and in production `.env` configurations.

---

## 7. Final Git Status and Diff Summary

### 7.1 Git Status (`git status --short`)
```text
 M .env.example
 M .gitignore
 M Documentation/ARCHITECTURE_GUIDE.md
 M Documentation/COMPLETE_TRANSFORMATION.md
D  Documentation/atlas-credentials.env
 M Documentation/outstanding_features.md
 M Documentation/project_explanation.md
 M apps/backend/.env.example
 M apps/backend/README.md
 M apps/backend/package.json
 M apps/backend/src/controllers/auth.controller.ts
 M apps/backend/src/controllers/order.controller.ts
 M apps/backend/src/controllers/shipment.controller.ts
 M apps/backend/src/controllers/supplyChain.controller.ts
 M apps/backend/src/controllers/verify.controller.ts
 M apps/backend/src/middleware/auth.ts
 M apps/backend/src/routes/order.routes.ts
 M apps/backend/src/routes/prediction.routes.ts
 M apps/backend/src/routes/verify.routes.ts
 M apps/backend/src/routes/weather.routes.ts
 M apps/backend/src/server.ts
 M apps/backend/src/services/agmarknet.service.ts
 M apps/backend/src/services/blockchain.service.ts
 M apps/backend/src/services/ml.service.ts
 M apps/backend/src/services/provenance.service.ts
 M apps/backend/src/services/provenanceListener.ts
 M apps/backend/test-blockchain.ts
 M apps/backend/test-provenance.ts
 M apps/ml-inference/main.py
 M apps/web/src/App.tsx
 M apps/web/src/components/GlobalSearch.tsx
 M apps/web/src/components/Navbar.tsx
 M apps/web/src/components/WeatherWidget.tsx
 D apps/web/src/pages/DiseaseDetection.tsx
 M apps/web/src/pages/FarmerDashboardNew.tsx
 M apps/web/src/pages/Landing.tsx
 M apps/web/src/pages/Login.tsx
 M apps/web/src/pages/Marketplace.tsx
 M apps/web/src/pages/WeatherIntelligence.tsx
 M apps/web/src/services/api.ts
 M blockchain/contract-address.json
 M blockchain/hardhat.config.js
 M blockchain/package.json
 M blockchain/scripts/deploy.js
 M docs/ARCHITECTURE.md
 M package-lock.json
 M package.json
 M packages/prisma/schema.prisma
 M packages/prisma/seed.ts
 M render.yaml
 M services/ai-service/.env.example
 M services/ai-service/main.py
 D services/ai-service/models/disease_predictor.py
 M services/ai-service/requirements.txt
 M services/ai-service/test_model.py
 M services/blockchain/deployment-info.json
 M services/blockchain/hardhat.config.ts
 M services/blockchain/package.json
 M start.bat
?? apps/backend/jest.config.js
?? apps/backend/reset-passwords.js
?? apps/backend/src/__tests__/
?? apps/backend/src/controllers/payment.controller.ts
?? apps/backend/src/controllers/weather.controller.ts
?? apps/backend/src/routes/payment.routes.ts
?? apps/backend/src/services/eventLifecycle.service.ts
?? apps/backend/src/services/evidenceHasher.ts
?? authorization_cache_and_contract_diff_directive022_report.md
?? blockchain/contracts/AgroTraceRegistry.sol
?? blockchain/test/
?? blockchain_architecture_audit_report.md
?? blockchain_directive010_contract_implementation_report.md
?? blockchain_directive011_backend_integration_report.md
?? blockchain_directive012_local_e2e_report.md
?? blockchain_directive013_persistence_integration_report.md
?? blockchain_directive014_testnet_preparation_report.md
?? blockchain_directive015_final_deployment_safety_gate_report.md
?? blockchain_directive016_safety_reverification_report.md
?? crop_disease_removal_directive017_report.md
?? p0_directive004_verification_report.md
?? p0_directive005_final_review_report.md
?? p0_directive006_refund_readiness_report.md
?? p0_directive007_webhook_recovery_report.md
?? predeployment_consistency_directive019_report.md
?? prediction_provenance_amoy_readiness_directive023_report.md
?? relayer_authorization_preflight_directive021_report.md
?? relayer_key_safety_directive020_report.md
?? render_deployment_directive018_report.md
?? scratch/directive011_baseline.patch
?? scratch/directive011_staged.patch
?? scratch/directive012_baseline.patch
?? scratch/directive012_staged.patch
?? scratch/directive013_baseline.patch
?? scratch/directive013_staged.patch
?? scratch/directive014_state.patch
?? scratch/directive015_baseline.patch
?? scratch/directive015_state.patch
?? services/blockchain/scripts/deploy-provenance.ts
?? services/blockchain/test/PredictionProvenanceAmoyDeploy.test.ts
?? stop.bat
```

### 7.2 Summary of Directive 023 Changes
1. **[services/blockchain/hardhat.config.ts](file:///c:/Users/chinn/Desktop/AgroTrace/services/blockchain/hardhat.config.ts):** Configured Polygon Amoy network (chainId 80002) and localhost (chainId 31337) with Polygonscan Amoy block explorer API mapping.
2. **[services/blockchain/package.json](file:///c:/Users/chinn/Desktop/AgroTrace/services/blockchain/package.json):** Added `deploy:local` and `deploy:amoy` npm run scripts.
3. **[services/blockchain/scripts/deploy-provenance.ts](file:///c:/Users/chinn/Desktop/AgroTrace/services/blockchain/scripts/deploy-provenance.ts):** Implemented standalone deployment script for `PredictionProvenance` with full safety validation, role assignment, administrative handover, and dry-run preflight.
4. **[services/blockchain/test/PredictionProvenanceAmoyDeploy.test.ts](file:///c:/Users/chinn/Desktop/AgroTrace/services/blockchain/test/PredictionProvenanceAmoyDeploy.test.ts):** Created 6 Hardhat tests verifying contract deployment, role separation, relayer execution, pause/unpause permissions, and deployer privilege stripping.
5. **[apps/backend/src/services/provenance.service.ts](file:///c:/Users/chinn/Desktop/AgroTrace/apps/backend/src/services/provenance.service.ts):** Upgraded `getContractAddress` and `getContract` to read multi-chain contract address registries, reject Hardhat dev addresses on Amoy, and verify connected chain ID 80002.
6. **[apps/backend/src/__tests__/blockchain_directive023_provenance_deployment.test.ts](file:///c:/Users/chinn/Desktop/AgroTrace/apps/backend/src/__tests__/blockchain_directive023_provenance_deployment.test.ts):** Created 9 offline unit tests verifying deployment safety gates and network isolation invariants.

---

## 8. Explicit Safety Confirmation

We explicitly confirm adherence to all project safety constraints during Directive 023:
- **NO Contract Deployments:** No contracts were deployed to Polygon Amoy, Polygon mainnet, Ethereum, or any public or cloud environment.
- **NO Public RPC Calls or Broadcasts:** Zero transactions were signed or broadcast to public networks. Zero faucets, public RPC endpoints, or live testnet nodes were contacted.
- **NO Credential Exposure:** No private keys, mnemonic phrases, API secrets, or database passwords were displayed, logged, or recorded.
- **NEVER Executed `reset-passwords.js`:** The forbidden file was never run.
- **NO Database Alterations:** No database migrations were executed, schema altered, or database records modified.
- **NO Destructive Git Operations:** No commits, pushes, pulls, merges, rebases, resets, or destructive checkouts were performed.
- **Historical Reports Intact:** All previous reports (`blockchain_directive010_...` through `authorization_cache_and_contract_diff_directive022_report.md`) remain untouched and preserved.

---

*Directive 023 implementation and audit complete. System is halted awaiting review.*
