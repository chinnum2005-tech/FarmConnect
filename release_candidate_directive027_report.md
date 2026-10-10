# PROJECT LEAD DIRECTIVE 027 — SAFE RELEASE CANDIDATE PREPARATION REPORT

**Date:** 2026-10-10  
**Directive:** Project Lead Directive 027 — Prepare Safe Release Candidate  
**Status:** READY FOR PROJECT LEAD REVIEW (AWAITING EXPLICIT AUTHORIZATION TO PUBLISH)  
**Safety Gate Enforced:** Zero commits created; zero pushes executed; zero remote merges; working tree preserved 100%.  

---

## 1. Executive Summary

Following confirmation in Directive 026 that GitHub write access to `chinnum2005-tech/AgroTrace` is fully verified, this directive prepares a clean, production-grade release candidate. 

Every modified, staged, and untracked file has been inspected and audited. Files have been strictly segregated into:
1. **Production Release Candidates:** The verified application services, configs, smart contracts, and regression test suites.
2. **Excluded Files:** Secrets, `.env` files, forbidden maintenance scripts, local audit reports, patch archives, and build artifacts.

Crop disease detection remains **100% removed** across the entire codebase. No remote history has been merged or overwritten, no commits were created, and no pushes or deployments were triggered.

---

## 2. Proposed Production Release Files

The following files represent the verified production application and are designated for inclusion in the release candidate:

### 2.1 Root Monorepo & Deployment Infrastructure
| File Path | Status | Purpose / Role |
|---|:---:|---|
| `render.yaml` | Modified | Render 4-service blueprint with synchronized `/health` checks & URLs |
| `package.json` | Modified | Monorepo root workspace definitions and build scripts |
| `package-lock.json` | Modified | Locked dependency tree |
| `.gitignore` | Modified | Ignores `.env`, caches, build output, and local test artifacts |
| `.env.example` | Modified | Safe environment template with all required keys (no secrets) |
| `start.bat` | Modified | Safe local developer startup script |
| `docs/ARCHITECTURE.md` | Modified | Core architectural system documentation |
| `Documentation/ARCHITECTURE_GUIDE.md` | Modified | Comprehensive system architecture reference |
| `Documentation/COMPLETE_TRANSFORMATION.md` | Modified | Audit and transformation roadmap documentation |
| `Documentation/outstanding_features.md` | Modified | System features inventory |
| `Documentation/project_explanation.md` | Modified | Project overview documentation |

### 2.2 Backend Application (`apps/backend`)
| File Path | Status | Purpose / Role |
|---|:---:|---|
| `apps/backend/package.json` | Modified | Backend dependencies and build scripts |
| `apps/backend/README.md` | Modified | Service documentation |
| `apps/backend/.env.example` | Modified | Documented backend environment variable template |
| `apps/backend/jest.config.js` | Untracked | Jest test framework configuration |
| `apps/backend/src/server.ts` | Modified | Express server with robust CORS origin handling and error guards |
| `apps/backend/src/middleware/auth.ts` | Modified | JWT auth precedence (Bearer header prioritized over cookies) |
| `apps/backend/src/controllers/auth.controller.ts` | Modified | Authentication controller |
| `apps/backend/src/controllers/order.controller.ts` | Modified | Order management controller |
| `apps/backend/src/controllers/shipment.controller.ts` | Modified | Logistics and shipment tracking |
| `apps/backend/src/controllers/supplyChain.controller.ts` | Modified | Supply chain events controller |
| `apps/backend/src/controllers/verify.controller.ts` | Modified | Cryptographic verification endpoint controller |
| `apps/backend/src/controllers/payment.controller.ts` | Untracked | Stripe payment processing with webhook recovery |
| `apps/backend/src/controllers/weather.controller.ts` | Untracked | Weather controller with safe 503 fallback |
| `apps/backend/src/routes/order.routes.ts` | Modified | Order routing |
| `apps/backend/src/routes/prediction.routes.ts` | Modified | Prediction routing directed to `ML_SERVICE_URL` |
| `apps/backend/src/routes/verify.routes.ts` | Modified | Public provenance verification routes |
| `apps/backend/src/routes/weather.routes.ts` | Modified | Weather query routes |
| `apps/backend/src/routes/payment.routes.ts` | Untracked | Payment and Stripe webhook routes |
| `apps/backend/src/services/agmarknet.service.ts` | Modified | Mandi commodity pricing with fallback |
| `apps/backend/src/services/blockchain.service.ts` | Modified | Registry anchoring with local simulation fallback |
| `apps/backend/src/services/ml.service.ts` | Modified | Inference client directed to `ML_SERVICE_URL` |
| `apps/backend/src/services/provenance.service.ts` | Modified | Prediction hashing and provenance anchoring |
| `apps/backend/src/services/provenanceListener.ts` | Modified | Background listener with offline/production safety |
| `apps/backend/src/services/eventLifecycle.service.ts` | Untracked | 5-state batch persistence lifecycle management |
| `apps/backend/src/services/evidenceHasher.ts` | Untracked | SHA-256 deterministic cryptographic hashing utility |
| `apps/backend/src/__tests__/*` | Untracked | Full automated test suite (8 passing test suites) |
| `apps/backend/test-blockchain.ts` | Modified | Blockchain integration test harness |
| `apps/backend/test-provenance.ts` | Modified | Provenance integration test harness |

### 2.3 Web Frontend (`apps/web`)
| File Path | Status | Purpose / Role |
|---|:---:|---|
| `apps/web/src/App.tsx` | Modified | React router with disease detection route permanently removed |
| `apps/web/src/services/api.ts` | Modified | Axios client with deduplicated `/api/v1` prefix handling |
| `apps/web/src/components/GlobalSearch.tsx` | Modified | Global search bar |
| `apps/web/src/components/Navbar.tsx` | Modified | Main navigation with disease menu item permanently removed |
| `apps/web/src/components/WeatherWidget.tsx` | Modified | Weather display widget |
| `apps/web/src/pages/FarmerDashboardNew.tsx` | Modified | Farmer dashboard |
| `apps/web/src/pages/Landing.tsx` | Modified | Landing page |
| `apps/web/src/pages/Login.tsx` | Modified | Login page |
| `apps/web/src/pages/Marketplace.tsx` | Modified | Agricultural produce marketplace |
| `apps/web/src/pages/WeatherIntelligence.tsx` | Modified | Weather forecasting page |
| `apps/web/src/pages/DiseaseDetection.tsx` | **DELETED** | **Permanently eliminated (Directive 017 compliance)** |

### 2.4 AI Microservice (`services/ai-service`)
| File Path | Status | Purpose / Role |
|---|:---:|---|
| `services/ai-service/main.py` | Modified | FastAPI service with `/health` route and retained advisory models |
| `services/ai-service/requirements.txt` | Modified | Pinned dependencies without PyTorch |
| `services/ai-service/test_model.py` | Modified | Unit tests for Yield, Crop, and Fertilizer advisors |
| `services/ai-service/.env.example` | Modified | Service environment template |
| `services/ai-service/models/disease_predictor.py`| **DELETED** | **Permanently eliminated (Directive 017 compliance)** |

### 2.5 ML Inference Microservice (`apps/ml-inference`)
| File Path | Status | Purpose / Role |
|---|:---:|---|
| `apps/ml-inference/main.py` | Modified | FastAPI service with standardized `/health` route |

### 2.6 Database Schema (`packages/prisma`)
| File Path | Status | Purpose / Role |
|---|:---:|---|
| `packages/prisma/schema.prisma` | Modified | MongoDB Prisma schema |
| `packages/prisma/seed.ts` | Modified | Safe database seeder |

### 2.7 Smart Contracts & Deployment Tooling
| File Path | Status | Purpose / Role |
|---|:---:|---|
| `blockchain/contracts/AgroTraceRegistry.sol` | Untracked | Core ERC-based traceability registry contract |
| `blockchain/scripts/deploy.js` | Modified | Safe deployment script with confirmation gate |
| `blockchain/hardhat.config.js` | Modified | Isolated network configuration |
| `blockchain/package.json` | Modified | Hardhat package configuration |
| `blockchain/contract-address.json` | Modified | Local deployment address mapping |
| `blockchain/test/AgroTraceRegistry.test.ts` | Untracked | Contract test suite (23 passing tests) |
| `services/blockchain/scripts/deploy-provenance.ts`| Untracked | Safe provenance deployment script |
| `services/blockchain/hardhat.config.ts` | Modified | Isolated network configuration |
| `services/blockchain/package.json` | Modified | Hardhat package configuration |
| `services/blockchain/deployment-info.json` | Modified | Provenance deployment info mapping |
| `services/blockchain/test/` | Untracked | Provenance contract test suites |

---

## 3. Excluded Files by Category (Must NOT Be Committed)

The following files are strictly excluded from the release candidate:

### Category 1: Secrets, Credentials & Local Environments
- `Documentation/atlas-credentials.env` (Staged for deletion; must NEVER be restored to git)
- `.env` files in any directory (`.env`, `apps/backend/.env`, `apps/web/.env`, etc.)
- Any private keys or relayer credentials

### Category 2: Forbidden Maintenance Scripts
- `apps/backend/reset-passwords.js` (Untracked maintenance script with plain-text query risks; forbidden from being executed or committed)

### Category 3: Local Directive & Audit Reports (23 Files)
- `authorization_cache_and_contract_diff_directive022_report.md`
- `blockchain_architecture_audit_report.md`
- `blockchain_directive010_contract_implementation_report.md`
- `blockchain_directive011_backend_integration_report.md`
- `blockchain_directive012_local_e2e_report.md`
- `blockchain_directive013_persistence_integration_report.md`
- `blockchain_directive014_testnet_preparation_report.md`
- `blockchain_directive015_final_deployment_safety_gate_report.md`
- `blockchain_directive016_safety_reverification_report.md`
- `crop_disease_removal_directive017_report.md`
- `final_local_e2e_verification_directive024_report.md`
- `github_access_recheck_directive026_report.md`
- `p0_directive004_verification_report.md`
- `p0_directive005_final_review_report.md`
- `p0_directive006_refund_readiness_report.md`
- `p0_directive007_webhook_recovery_report.md`
- `predeployment_consistency_directive019_report.md`
- `prediction_provenance_amoy_readiness_directive023_report.md`
- `relayer_authorization_preflight_directive021_report.md`
- `relayer_key_safety_directive020_report.md`
- `render_deployment_directive018_report.md`
- `render_deployment_directive025_report.md`
- `release_candidate_directive027_report.md`

### Category 4: Scratch Patch Files & Archives
- `scratch/directive011_baseline.patch`
- `scratch/directive011_staged.patch`
- `scratch/directive012_baseline.patch`
- `scratch/directive012_staged.patch`
- `scratch/directive013_baseline.patch`
- `scratch/directive013_staged.patch`
- `scratch/directive014_state.patch`
- `scratch/directive015_baseline.patch`
- `scratch/directive015_state.patch`

### Category 5: TypeScript Build Output Intermediates
- `services/blockchain/scripts/deploy-provenance.js`
- `services/blockchain/scripts/deploy-provenance.js.map`
- `services/blockchain/scripts/deploy-provenance.d.ts`
- `services/blockchain/scripts/deploy-provenance.d.ts.map`
*(The TypeScript source `deploy-provenance.ts` is tracked; build artifacts should not be committed)*

### Category 6: Local Convenience Batch Scripts
- `stop.bat` (Local Windows development process cleanup script)

---

## 4. Verification Checklist

- [x] **Crop Disease Detection:** Scanned all source directories (`apps/web/src`, `apps/backend/src`, `services/ai-service`, `apps/ml-inference`). 0 occurrences of disease predictor or disease detection UI found. `DiseaseDetection.tsx` and `disease_predictor.py` remain deleted.
- [x] **Verified Services Included:** All 4 application services (`agrotrace-backend`, `agrotrace-ai-service`, `agrotrace-ml-inference`, and `agrotrace-web`) along with their shared Prisma schema and blockchain contracts are included.
- [x] **Zero Secrets in Candidate:** Only `.env.example` templates are included; all live credentials excluded.
- [x] **Production Builds Verified:** Locally validated in Directive 024 (`apps/web` Vite build and `apps/backend` TypeScript build both succeeded with 0 errors).
- [x] **Automated Tests Verified:** All 168 tests across 10 test suites passed 100%.

---

## 5. Planned Safe Publishing Workflow

Upon receiving separate explicit authorization from the project lead, the following exact commands will be executed to publish the release candidate cleanly without merge conflicts or history overwrites:

```bash
# 1. Create a dedicated release branch from current HEAD:
git checkout -b release/v1-production

# 2. Stage only the verified production files explicitly (never git add .):
git add render.yaml package.json package-lock.json .gitignore .env.example start.bat docs/ Documentation/ packages/prisma/
git add apps/backend/package.json apps/backend/README.md apps/backend/.env.example apps/backend/jest.config.js apps/backend/src/ apps/backend/test-blockchain.ts apps/backend/test-provenance.ts
git add -u apps/web/
git add apps/web/src/
git add -u services/ai-service/
git add services/ai-service/
git add apps/ml-inference/
git add blockchain/contracts/ blockchain/scripts/ blockchain/test/ blockchain/hardhat.config.js blockchain/package.json blockchain/contract-address.json
git add services/blockchain/scripts/deploy-provenance.ts services/blockchain/test/ services/blockchain/hardhat.config.ts services/blockchain/package.json services/blockchain/deployment-info.json

# 3. Create the clean release candidate commit:
git commit -m "chore(release): v1.0.0 production release candidate with verified E2E and Render config"

# 4. Push the clean release branch to GitHub:
git push origin release/v1-production
```

### Why this is safe:
- **Zero Remote Conflict:** It pushes to a new branch (`release/v1-production`), avoiding non-fast-forward rejection against `origin/main`'s historical commit `39bb969`.
- **Zero Force-Push:** Does not rewrite or overwrite any remote history on GitHub.
- **Render Ready:** In the Render Dashboard, simply setting the deployment branch to `release/v1-production` triggers the clean build immediately.

---

## 6. Explicit Safety Confirmation

- **Preservation of Repository:** All staged, unstaged, and untracked work across Directives 010–026 is preserved.
- **Zero Destructive Git Commands:** No `git reset`, `git clean`, `git rebase`, or destructive checkouts occurred.
- **Zero Commits or Pushes:** No commits were created; no changes were pushed to any remote branch.
- **Zero Public Blockchain Transactions:** No contracts deployed to Amoy or mainnet.
- **`apps/backend/reset-passwords.js` Untouched:** The script was never executed.
- **Zero Database Operations:** No migrations or database record modifications occurred.

*Execution halted for project lead review. Awaiting explicit authorization to publish the release candidate.*
