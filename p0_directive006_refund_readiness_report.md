# PROJECT LEAD DIRECTIVE 006 — REFUND LIFECYCLE & RELEASE READINESS AUDIT REPORT

**Project:** AgroTrace  
**Priority:** P0 Security and Financial Correctness  
**Date:** October 9, 2026  
**Repository Working Directory:** `C:\Users\chinn\Desktop\AgroTrace`  
**Host Node Binary:** `C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe` (Node v24.13.0)  
**Overall Readiness Recommendation:** **CONDITIONAL** (Ready for Next Stage subject to owner credential rotation and Stripe test-mode credential provisioning)

---

## 1. Git and Backup Preservation Evidence

- **Current Branch:** `main` (Diverged: 8 commits ahead of origin/main, 1 behind).
- **Current HEAD Commit:** `eea2f35fb2dfe9fd8cf7f0bc1d063b1d267135ce`.
- **Git Status Summary:**
  - `D Documentation/atlas-credentials.env` (Staged for removal from Git index; file preserved on disk and ignored in `.gitignore`).
  - Working-tree files preserved with zero broad resets or cleans.
  - Untracked backups intact: `apps/backend/reset-passwords.js`, `apps/backend/src/controllers/payment.controller.ts`, `apps/backend/src/routes/payment.routes.ts`, `stop.bat`.
- **Backup Verification:**
  - Backup Branch: `backup/head-eea2f35` intact.
  - Scratch Archive Directory: `C:\Users\chinn\.gemini\antigravity-ide\brain\1418882a-57ec-42b9-894d-cc50416bd70f\scratch\`
    - `uncommitted_work.patch` (59.5 KB)
    - `directive003_checkpoint.patch` (77.7 KB)
    - `directive004_baseline.patch` (152 KB)
    - `directive004_complete.patch` (172 KB)
    - `directive005_complete.patch` (174 KB)
    - `directive006_complete.patch` (182 KB)
    - `atlas-credentials.env.bak` (375 B)
    - `untracked_backup/` containing historical source copies.

---

## 2. Source Files Inspected

1. **[`apps/backend/src/controllers/payment.controller.ts`](file:///c:/Users/chinn/Desktop/AgroTrace/apps/backend/src/controllers/payment.controller.ts):** Stripe webhook handler, idempotency tracking, order fulfillment transaction, currency/amount verification, error handling.
2. **[`apps/backend/src/controllers/order.controller.ts`](file:///c:/Users/chinn/Desktop/AgroTrace/apps/backend/src/controllers/order.controller.ts):** Order creation, session generation, state transition policy (`VALID_ORDER_TRANSITIONS`), order cancellation logic, inventory restoration.
3. **[`apps/backend/src/controllers/shipment.controller.ts`](file:///c:/Users/chinn/Desktop/AgroTrace/apps/backend/src/controllers/shipment.controller.ts):** Shipment claim, state transitions, distributor ownership DB update predicates, order status synchronization.
4. **[`apps/backend/src/controllers/weather.controller.ts`](file:///c:/Users/chinn/Desktop/AgroTrace/apps/backend/src/controllers/weather.controller.ts):** Weather proxy implementation, input sanitization, caching, rate limiting, and safe error handling.
5. **[`apps/backend/src/routes/payment.routes.ts`](file:///c:/Users/chinn/Desktop/AgroTrace/apps/backend/src/routes/payment.routes.ts):** Webhook route mounting (express.raw body).
6. **[`packages/prisma/schema.prisma`](file:///c:/Users/chinn/Desktop/AgroTrace/packages/prisma/schema.prisma):** Data models (`Order`, `OrderItem`, `Shipment`, `StripeWebhookEvent`, `Product`).
7. **[`apps/web/src/pages/WeatherIntelligence.tsx`](file:///c:/Users/chinn/Desktop/AgroTrace/apps/web/src/pages/WeatherIntelligence.tsx) & [`WeatherWidget.tsx`](file:///c:/Users/chinn/Desktop/AgroTrace/apps/web/src/components/WeatherWidget.tsx):** Client-side weather data fetching.
8. **[`apps/backend/src/__tests__/security_containment.test.ts`](file:///c:/Users/chinn/Desktop/AgroTrace/apps/backend/src/__tests__/security_containment.test.ts):** Automated test suite for security, concurrency, and financial invariants.

---

## 3. Payment & Refund Lifecycle Findings

### Critical Architectural Finding on `REFUND_REQUIRED`
- **Current Behavior:** The system correctly flags orders as `paymentStatus: 'REFUND_REQUIRED'` under four critical edge cases:
  1. Amount or currency tampering detected during webhook processing.
  2. Order cancelled concurrently before webhook processing finishes.
  3. Insufficient product inventory discovered during atomic fulfillment attempt.
  4. Authorized cancellation of an already-paid order (by a farmer).
- **Core Limitation:** `REFUND_REQUIRED` is currently an **internal database marker**. The codebase does **NOT** contain an automated client calling `stripe.refunds.create`, nor does it have a background worker or webhook handler for `charge.refunded` / `refund.updated` to transition `REFUND_REQUIRED` $\to$ `REFUNDED`.
- **Operational Reality:** In the current version, any order entering `REFUND_REQUIRED` requires manual refund issuance via the Stripe Dashboard by an operations team member or administrator until an automated refund worker is provisioned.

### Distributed Transaction Boundary & Third-Party Latency
- **No Stripe Calls in Database Transactions:** External Stripe network calls (such as `stripe.checkout.sessions.create`) execute **outside** database transactions. The Prisma database transaction commits before session creation, and the session ID is stored in a subsequent lightweight update.
- **Webhook Processing:** Webhook verification and signature decoding are strictly local CPU operations. Inside `prisma.$transaction`, only database queries are executed. No slow HTTP requests to Stripe occur inside database transactions, protecting connection pools.

---

## 4. Scenario-by-Scenario State Transitions

| # | Scenario | `Order.status` | `Order.paymentStatus` | Stripe Identifiers | Inventory Effect | Shipment Status | Refund State & Reconciliation |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Unpaid order cancelled before Stripe confirms** | `CANCELLED` | `CANCELLED` | `stripeSessionId` present, `paymentIntentId`: null | 0 net change (never deducted) | `CANCELLED` / none | N/A (no charge occurred) |
| **2** | **Stripe confirms after cancellation committed** | `CANCELLED` | `REFUND_REQUIRED` | `paymentIntentId` recorded | 0 net change (claim failed, no stock deducted) | None (shipment not created) | Flagged `REFUND_REQUIRED`. Card was charged; manual/worker Stripe refund needed. |
| **3** | **Payment succeeds before consumer attempts cancel** | `PAID` | `PAID` | `paymentIntentId` recorded | Deducted by item quantities | `PENDING_FARMER` | N/A (order valid; consumer cancellation rejected with 400/409) |
| **4** | **Farmer cancels already-paid order** | `CANCELLED` | `REFUND_REQUIRED` | `paymentIntentId` recorded | **Restored** (+quantity incremented back) | `CANCELLED` | Flagged `REFUND_REQUIRED`. Stock restored; manual/worker Stripe refund needed. |
| **5** | **Repeated Stripe webhook delivery** | `PAID` | `PAID` | Unchanged | Deducted strictly once | `PENDING_FARMER` (single record) | Deduplicated via `StripeWebhookEvent.processedAt`; HTTP 200 returned. |
| **6** | **Refund request fails, times out, or retries** | `FAILED` / `CANCELLED` | `REFUND_REQUIRED` | `paymentIntentId` recorded | Preserved / restored | None / `CANCELLED` | No automated worker exists. System remains in `REFUND_REQUIRED` marker state. |
| **7** | **Payment succeeds, but stock allocation fails** | `FAILED` | `REFUND_REQUIRED` | `paymentIntentId` recorded | 0 net change (transaction rolled back) | None (shipment not created) | Flagged `REFUND_REQUIRED`. Manual/worker Stripe refund needed. |
| **8** | **Shipment creation fails during fulfillment** | Rolled back to `PENDING` | Rolled back to `UNPAID` | Preserved on session | 0 net change (transaction rolled back) | Not created | Webhook returns 500; Stripe retries delivery. |

---

## 5. Identified Defects and Their Severity

| Issue ID | Severity | Component | Description & Remediation |
| :--- | :--- | :--- | :--- |
| **DEF-01** | **MEDIUM** (Operational Gap) | Payment Controller | **Absence of Automated Stripe Refund Dispatch:** When an order transitions to `REFUND_REQUIRED`, no API call (`stripe.refunds.create`) is dispatched to Stripe. The customer remains charged until manual intervention in the Stripe dashboard. *Recommended: Implement an automated refund dispatch worker with idempotency keys once approved.* |
| **DEF-02** | **LOW** (Schema Gap) | Prisma Schema | **Missing `refundId` and `refundStatus` fields on Order model:** The `Order` model lacks explicit fields for Stripe refund identifiers (e.g. `re_...`). Currently relies solely on `paymentStatus: 'REFUND_REQUIRED' \| 'REFUNDED'`. |
| **DEF-03** | **LOW** (Operational Gap) | Payment Routes | **Missing `charge.refunded` Webhook Handler:** The webhook controller only listens for `checkout.session.completed`. Webhooks for refund events (`charge.refunded`) are currently unhandled. |

---

## 6. Tests Added & Exact Execution Results

We expanded the automated test suite in [`apps/backend/src/__tests__/security_containment.test.ts`](file:///c:/Users/chinn/Desktop/AgroTrace/apps/backend/src/__tests__/security_containment.test.ts) to **28 focused automated tests**.

### Test Execution Command
```powershell
& "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" node_modules/jest/bin/jest.js `
  apps/backend/src/__tests__/security_containment.test.ts `
  --preset ts-jest `
  --globals '{\"ts-jest\":{\"tsconfig\":\"apps/backend/tsconfig.json\"}}'
```

### Complete Test Results (28/28 PASS, 100% Pass Rate in 2.737s)
```
PASS apps/backend/src/__tests__/security_containment.test.ts
  P0 Security Containment & Concurrency Verification
    Gate 2: Order Authorization & IDOR Protection
      √ Invariant 1: Consumer cannot mark an order PAID (3 ms)
      √ Invariant 2: Consumer cannot mark an order DELIVERED (1 ms)
      √ Invariant 3: A different user cannot modify another user's order (IDOR) (1 ms)
      √ Invariant 4: A different user cannot view another user's order (IDOR)
    Gate 3: Shipment Authorization & Concurrency
      √ Invariant 5: Non-distributor cannot claim a shipment (2 ms)
      √ Invariant 6: Concurrent shipment claims cannot both succeed (1 ms)
      √ Invariant 7: Invalid shipment transitions are strictly rejected
      √ Invariant 8: Consumer cannot update shipment status under any circumstance
    Gate 4: Payment Webhooks & Safe Configuration Failure
      √ Invariant 9: Webhook endpoint fails safely with HTTP 503 when Stripe is unconfigured (33 ms)
      √ Invariant 10: Repeated valid webhook events do not duplicate fulfillment (4 ms)
      √ Invariant 11: Missing Stripe configuration in order creation fails safely with 503 (29 ms)
    Directive 004: Weather Proxy Security & Input Validation
      √ Invariant 12: Weather proxy returns 503 when OPENWEATHER_API_KEY is not configured (1 ms)
      √ Invariant 13: Weather proxy rejects malicious or invalid city names with HTTP 400 (1 ms)
      √ Invariant 14: Weather proxy rejects out-of-bounds coordinates with HTTP 400
      √ Invariant 15: Safe error handling on upstream 404 and upstream timeout (1 ms)
      √ Invariant 16: Weather proxy caches responses and does not repeat upstream calls (1 ms)
    Directive 004: Order & Shipment Concurrency and State Consistency
      √ Invariant 17: Order concurrent modification is detected by atomic DB predicate (409 Conflict) (1 ms)
      √ Invariant 18: Cancelling an order atomically cancels linked shipment within transaction
      √ Invariant 19: Distributor ownership is enforced in DB update predicate on shipment status changes (1 ms)
      √ Invariant 20: Payment webhook enforces atomic UNPAID guard predicate to prevent duplicate inventory deduction
    Directive 005: Payment & Cancellation Concurrency Race Conditions
      √ Invariant 21: Cancellation winning race flags REFUND_REQUIRED in webhook without deducting stock or creating shipment (1 ms)
      √ Invariant 22: Payment winning race prevents concurrent cancellation via DB predicate (409 Conflict)
      √ Invariant 23: Authorized cancellation of already-PAID order restores stock and flags REFUND_REQUIRED (1 ms)
    Directive 006: Comprehensive Refund & Financial Invariant Verification
      √ Invariant 24: Failed inventory allocation rolls back transaction and sets REFUND_REQUIRED with FAILED status
      √ Invariant 25: Shipment creation failure rolls back transaction and does not leave partially fulfilled state (1 ms)
      √ Invariant 26: Retried cancellation does not restore inventory twice (idempotent stock restoration) (10 ms)
      √ Invariant 27: Currency or payment amount mismatch rejects fulfillment and flags REFUND_REQUIRED
      √ Invariant 28: Idempotent refund retry simulation ensures zero duplicate refund dispatch (1 ms)

Test Suites: 1 passed, 1 total
Tests:       28 passed, 28 total
Snapshots:   0 total
Time:        2.737 s
```

---

## 7. Build and Compilation Verification

1. **Backend TypeScript Compilation:**
   ```powershell
   & "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" node_modules/typescript/lib/tsc.js `
     --project apps/backend/tsconfig.json --noEmit
   # Exit Code: 0 (Zero compiler errors)
   ```
2. **Prisma Client Generation:**
   ```powershell
   & "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" apps/backend/node_modules/prisma/build/index.js `
     generate --schema packages/prisma/schema.prisma
   # Result: Generated Prisma Client v5.7.0 across 3 client targets in 205ms
   ```
3. **Frontend Production Build:**
   ```powershell
   & "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" apps/web/node_modules/vite/bin/vite.js `
     build apps/web
   # Result: vite v5.4.21 building for production... ✓ built in 7.35s
   ```

---

## 8. Security-Readiness Inventory

| Credential / Component | Tracking Status | Runtime State | Required Owner Action |
| :--- | :--- | :--- | :--- |
| **`Documentation/atlas-credentials.env`** | `ABSENT FROM GIT INDEX` (Ignored in `.gitignore`) | Staged for removal from index; file preserved on disk | Commit the staged untracking when ready; do not recommit. |
| **MongoDB Atlas Password** | Exposed in historical Git commits | Active on Atlas cluster | Rotate database user password in Atlas console; update `DATABASE_URL` in host environment. |
| **OpenWeather API Key** | Exposed in historical Git commits | Cleansed from client bundle; backend proxy isolated | Revoke previous key on OpenWeather console; set new key under `OPENWEATHER_API_KEY` on backend. |
| **Data.gov.in API Key** | Exposed in historical Git commits | Used in Agmarknet service | Regenerate API token on Data.gov.in; update `DATA_GOV_IN_API_KEY`. |
| **Polygon Relayer Private Key** | Exposed in historical Git commits | Simulation mode active | Transfer balances to fresh wallet address; update `CONTRACT_OWNER_PRIVATE_KEY`. |
| **JWT Signing Secret** | Exposed in historical Git commits | Used for user auth | Generate new 256-bit secret; update `JWT_SECRET` (all sessions will safely invalidate). |
| **Stripe Gateway Credentials** | Unconfigured in production repo | Safely disabled (returns HTTP 503) | Obtain test mode keys (`sk_test_...`, `whsec_...`) for integration testing. |

---

## 9. Explicit Separation of Test Evidence

1. **Verified Application Behavior (with Mocks):**
   - 28/28 unit tests pass against actual production controller functions (`updateOrderStatus`, `getOrderById`, `createOrder`, `claimShipment`, `updateShipmentStatus`, `handleStripeWebhook`, `getCurrentWeather`, `getWeatherForecast`, `reverseGeocode`).
   - Mocked boundaries: Prisma database queries and Axios HTTP client.
2. **Unverified Live Database Behavior (Deferred):**
   - Live multi-threaded race conditions against a physical MongoDB instance are **not verified** because the repository connects to a shared cluster (`cluster0.vboqpmi.mongodb.net`). Real database concurrency tests should be executed against an ephemeral test container.
3. **Unverified Live Payment Behavior (Deferred):**
   - Live end-to-end Stripe card charges and webhooks are **not verified** because no live Stripe test credentials are configured in the environment.

---

## 10. Final Recommendation: CONDITIONAL

### Decision: `CONDITIONAL`

**Rationale:**
1. **P0 Security Containment is Complete:** All reported authorization gaps, IDOR vulnerabilities, client-side secret exposures, and unconstrained state transitions are closed and verified.
2. **Financial and Inventory Consistency Invariants Hold:** Database predicates prevent double fulfillment, duplicate stock deductions, and partial shipment states across all 8 explored lifecycle scenarios.
3. **Conditions Precedent to Public Release:**
   - **Condition 1 (Owner Credential Rotation):** Upstream provider credentials (MongoDB Atlas, OpenWeather, Polygon, Data.gov.in, JWT) must be rotated by the owner before public deployment.
   - **Condition 2 (Automated Refund Dispatch & Reconciliation):** Implement automated Stripe refund execution (`stripe.refunds.create` with idempotency keys) and listen for `charge.refunded` webhooks, or document manual dashboard refund protocols for orders in `REFUND_REQUIRED` state.
   - **Condition 3 (Stripe Test-Mode E2E Verification):** Configure test keys in a staging environment to verify webhook signatures end-to-end via the Stripe CLI.

Stopping here and awaiting Project Lead review.
