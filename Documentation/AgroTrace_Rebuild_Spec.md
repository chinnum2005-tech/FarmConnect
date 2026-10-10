# AgroTrace (FarmConnect) — Rebuild Specification for Antigravity

## How to use this document

For **every** item below:
1. **Check first** — inspect the codebase/DB/deployed environment to see if this already exists and matches the spec.
2. **If it exists and matches spec** → do not touch it. Log it as `VERIFIED — NO CHANGE`.
3. **If it's missing, partial, or has silently degraded** (e.g. mock data returned where real data should be, a provenance tag missing, an endpoint stubbed out) → **rebuild only that piece** to match spec. Log it as `REBUILT`.
4. **Never regenerate a working feature from scratch.** Never overwrite a file just because it's touched during a related fix — diff first, change only what's actually broken.
5. Produce a **checklist report** at the end (see template at bottom) — what was verified, what was rebuilt, what's still missing.

This project previously reached a complete, working state before being lost during a hosting/deployment attempt. This document is the source of truth for what "complete" means.

---

## 0. Tech Stack (verify this is intact before anything else)

- **Frontend:** React / TypeScript / Tailwind / Framer Motion — Vite monorepo at `apps/web`
- **Backend:** Express.js / Node.js / TypeScript — `apps/backend`
- **Database:** MongoDB via Prisma's MongoDB connector
- **ML microservice:** Python FastAPI — **must remain strictly separate from the Express runtime** (no shared process, no direct imports across the boundary — only HTTP calls)
- **Blockchain:** Solidity (`Traceability.sol`) deployed to Polygon Amoy testnet, written via ethers.js + a relayer wallet
- **External APIs:**
  - NASA POWER (weather)
  - Agmarknet via data.gov.in (mandi prices) — resource ID `9ef84268-d588-465a-a308-a864a43d0070`, requires free API key
  - SentinelHub (satellite/NDVI) — **intentionally mocked**, must remain clearly labeled as mock
- **Core data models:** Farm, Field, Crop, Product, Order, Shipment, SupplyChainEvent, CropRecommendation, PriceHistory
- **RBAC roles:** Farmer, Distributor, Consumer, Admin

**Check:** Confirm monorepo structure matches this. Confirm ML service has no direct import path into Express code or vice versa — only fetch/HTTP calls.

---

## 1. Non-negotiable project-wide principle: Honest data labeling

This is the single most important rule in the entire codebase. Apply it as a checklist item to every phase below, not just as a general note:

- Any simulated, synthetic, or mock data **must be explicitly labeled end-to-end** — in the API response, in the DB record, and in the UI. It must never be presented as if it were real satellite data, real AI validation, or a real on-chain transaction.
- Every prediction/recommendation must carry a **provenance field** so the farmer-facing UI can show the basis for the number, not just the number itself.
- If a real data source is unreachable (missing API key, network failure, rate limit), **the correct behavior is to fail loudly or show an honest "unavailable" state** — not to silently substitute mock data and present it as real. (Silent fallback to mock in a place expecting real data is the #1 suspected cause of the current regression — check for this everywhere.)

**Check across the whole app:** grep for any `catch` blocks that return mock/placeholder data without a label, and any hardcoded numbers presented in production paths.

---

## 2. Phase 4 — Blockchain Traceability

**Spec:**
- `Traceability.sol` deployed to Polygon Amoy testnet
- Real on-chain writes via ethers.js + relayer wallet for every new `SupplyChainEvent`
- No fake/random hash generation for new events
- Legacy fake hashes from before this phase are backfilled and explicitly tagged `LEGACY_SIMULATED` — these should NOT be regenerated as real, they're historical and correctly labeled

**Check:**
- Query a recent `SupplyChainEvent` — does its tx hash resolve on Polygon Amoy explorer?
- Confirm relayer wallet is funded and configured via env var, not hardcoded
- Confirm no code path generates a fake hash for new events
- Confirm `LEGACY_SIMULATED` tag is still present on old records (don't touch these)

---

## 3. Phase 1 — NDVI / Crop Health

**Spec:**
- FastAPI ML microservice with a SentinelHub **mock** client
- Mock is tagged `SIMULATED_MOCK` end-to-end (API response, DB record, UI)
- 5-day staleness cache
- Fire-and-forget async ingestion (doesn't block the request/response cycle)
- Health detection logic uses a **trailing 60-day NDVI trend**, not a single-point snapshot

**Check:**
- Hit the FastAPI NDVI endpoint directly — confirm `SIMULATED_MOCK` tag is present in the response
- Confirm cache is actually 5-day staleness, not re-fetching every call or never refreshing
- Confirm ingestion is genuinely async/non-blocking
- Confirm health status is computed from a 60-day trend calculation, not just the latest value

---

## 4. Phase 2 — Yield Prediction

**Spec:**
- LightGBM regressor
- Trained on synthetic data, tagged `modelProvenance: "SYNTHETIC_BOOTSTRAP"`
- Surfaced in a React `ComposedChart` with **dashed lines** and **warning badges** to visually distinguish predicted/synthetic-based values from real ones

**Check:**
- Confirm model file loads and produces predictions (not a stub function)
- Confirm API response includes `modelProvenance: "SYNTHETIC_BOOTSTRAP"`
- Confirm frontend chart actually renders dashed lines + warning badge — not silently dropped in a UI redesign

---

## 5. Phase 3 — Crop Recommendation

**Spec:**
- XGBoost classifier trained on the real Kaggle Crop Recommendation Dataset (~98.6% test accuracy)
- ROI calculated from **live Agmarknet modal prices**, not hardcoded/static prices
- Response tagged `roiBasis: "current_market_price"` and `modelProvenance: "PUBLIC_DATASET_COLD_START"`

**Check:**
- Confirm model file/weights are the real trained XGBoost model, not a placeholder
- Confirm ROI numbers change when Agmarknet prices change (i.e. it's a live call, not cached indefinitely or hardcoded)
- Confirm both provenance tags are present in the API response

---

## 6. Market Price Widget

**Spec:**
- Real Agmarknet integration — **no hardcoded placeholder prices**
- Daily cron job accumulating data into `PriceHistory`
- Statistical trend projection (linear regression or moving average) — not a fabricated "AI Confidence" score
- UI framing must be honest about what the projection is and isn't

**Check:**
- Confirm cron job is actually running on schedule in the hosted environment (check scheduler logs/process, not just that the code exists)
- Query `PriceHistory` — is it actually accumulating daily records, or empty/stale?
- Confirm no "AI Confidence %" or similar fabricated metric has crept back in
- If there isn't enough history yet for a reliable trend, confirm the UI shows an honest "building historical trend" notice rather than a fake-confident number

---

## 7. Supply Chain Map (Leaflet)

**Spec + open items that were never confirmed before the regression — verify all of these explicitly:**
- [ ] `/map-demo` route is registered and loads
- [ ] `requestAnimationFrame` cleanup happens correctly on component unmount (no leaked RAF loops)
- [ ] No direct DOM manipulation causing marker desync from React state
- [ ] Interpolation is correct at 5x playback speed (not just at 1x)
- [ ] Checkpoint click-to-snap actually works (clicking a checkpoint snaps the marker/playback to that point)

These were flagged as unverified even before the hosting regression — treat them as still open regardless of what the diagnosis of the current state finds.

---

## 8. RBAC

**Spec:** Farmer, Distributor, Consumer, Admin roles with distinct permissions across all the above features (e.g. only Farmer/Admin can trigger new SupplyChainEvents, Consumer is read-only on traceability, etc. — confirm against whatever the original role-permission matrix was in the auth middleware).

**Check:** Confirm role checks are present on relevant routes, not bypassed or removed.

---

## 9. Environment / Deployment sanity check (do this FIRST, before rebuilding anything)

Given the regression happened during a hosting attempt, check this before assuming any feature is actually broken:

- [ ] All env vars present on the hosting platform (not just local `.env`): Agmarknet key, NASA POWER key, `DATABASE_URL`, relayer private key, SentinelHub-related vars
- [ ] `DATABASE_URL` points at the real, populated MongoDB — not an empty fresh instance
- [ ] No code path was patched during the deployment attempt to silently return mock data when a real service/key is unreachable, instead of failing loudly

If a feature "looks broken" but is actually just missing its env var in the hosted environment, **fix the env var — do not rebuild the feature.**

---

## Required output: Rebuild Report

After going through every section above, produce a report in this format:

```
## AgroTrace Rebuild Report

| Section | Status | Notes |
|---|---|---|
| 0. Tech stack integrity | VERIFIED / REBUILT / MISSING | |
| 1. Honest data labeling (global) | ... | |
| 2. Blockchain (Phase 4) | ... | |
| 3. NDVI/Crop Health (Phase 1) | ... | |
| 4. Yield Prediction (Phase 2) | ... | |
| 5. Crop Recommendation (Phase 3) | ... | |
| 6. Market Price Widget | ... | |
| 7. Supply Chain Map | ... | |
| 8. RBAC | ... | |
| 9. Env/Deployment | ... | |

### Items rebuilt from scratch:
(list with reasoning — what was missing/broken and why)

### Items verified with no changes:
(list)

### Still open / needs manual decision:
(anything ambiguous — e.g. "found two conflicting implementations of X, need direction")
```

Do not mark anything `VERIFIED` without actually checking it against the spec above (querying the DB, hitting the endpoint, or reading the relevant code) — do not assume based on file presence alone.
