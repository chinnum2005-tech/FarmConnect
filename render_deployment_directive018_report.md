# PROJECT LEAD DIRECTIVE 018 — RENDER DEPLOYMENT AUDIT AND SAFE REPAIR REPORT

**Project:** AgroTrace / FarmConnect  
**Directive:** Project Lead Directive 018 — Render Deployment Audit and Safe Repair  
**Execution Date:** October 10, 2026  
**Status:** COMPLETE (All Local Audits, Repairs, and Verifications Passed; Safe for Production Deployment Review)

---

## 1. Executive Summary

In accordance with Project Lead Directive 018, a comprehensive audit and safe local repair of the Render multi-service deployment configuration was conducted. All existing source code, past architectural milestones (Directives 010–016 blockchain integration and Directive 017 complete crop disease detection removal), and working tree states were strictly preserved.

No commits, pushes, remote deployments, database migrations, or public blockchain RPC transactions were executed. All audits were conducted using static inspection, mocked/unit tests, and local builds.

### Key Audit Findings & Confirmed Repairs
1. **Auth Token / Cookie Precedence Inversion (`apps/backend/src/middleware/auth.ts`):**  
   The backend previously checked `req.cookies?.token` before `req.headers.authorization`. If a browser held an expired, stale, or old cookie, the backend ignored a valid incoming `Authorization: Bearer <token>` sent from `localStorage` by the frontend, triggering unauthenticated 401 errors.  
   *Repair:* Inverted the precedence so `Authorization: Bearer <token>` takes priority, falling back to cookie only when no Bearer header is present.
2. **CORS Configuration & Trailing Slash Sensitivity (`apps/backend/src/server.ts`):**  
   `allowedOrigins` was strictly checking string equality against `process.env.CORS_ORIGIN`. A trailing slash in Render environment variables (e.g. `https://agrotrace-web.onrender.com/`) caused the origin header `https://agrotrace-web.onrender.com` sent by browsers to fail matching. Furthermore, calling `callback(new Error('Not allowed by CORS'))` threw an uncaught error in Express that converted preflight `OPTIONS` requests into `HTTP 500 Internal Server Error`.  
   *Repair:* Normalized origins by stripping trailing slashes, added `https://agrotrace-web.onrender.com` as an explicit baseline origin, supported Render preview subdomains (`^https:\/\/agrotrace-web(-[a-z0-9-]+)?\.onrender\.com$`), and returned `callback(null, false)` for graceful CORS rejection without server errors.
3. **Backend-to-Python Service Routing (`AI_SERVICE_URL` vs `ML_SERVICE_URL`):**  
   `render.yaml` provisions two Python services: `agrotrace-ai-service` (port 10000, `services/ai-service`) and `agrotrace-ml-inference` (port 10000, `apps/ml-inference`). In `apps/backend/src/routes/prediction.routes.ts` and `apps/backend/src/services/ml.service.ts`, requests for `/yield/predict-yield`, `/recommend/crop`, and `/health/ndvi-health` were hardcoded to `AI_SERVICE_URL`. On Render, `AI_SERVICE_URL` routes to `services/ai-service` which does not host those endpoints (they are hosted on `apps/ml-inference`).  
   *Repair:* Updated service URL definitions in `prediction.routes.ts` and `ml.service.ts` to `process.env.ML_SERVICE_URL || process.env.AI_SERVICE_URL || 'http://localhost:8000'`, ensuring proper routing to `agrotrace-ml-inference` while preserving single-service development fallbacks.
4. **Missing Standard `/health` Route on ML Inference Service (`apps/ml-inference/main.py` & `render.yaml`):**  
   `apps/ml-inference` lacked a root `/health` GET endpoint. Added `@app.get("/health")` and configured `healthCheckPath: /health` in `render.yaml` for both Python services (`agrotrace-ai-service` and `agrotrace-ml-inference`) to prevent false-unhealthy deployment timeouts.
5. **Frontend API URL Redundant `/api/v1` Prefix Handling (`apps/web/src/services/api.ts`):**  
   The request interceptor stripped `/api/`, which would transform any call to `/api/v1/endpoint` into `/v1/endpoint`, causing duplication with `baseURL` (`.../api/v1`) resulting in `.../api/v1/v1/endpoint` 404s.  
   *Repair:* Interceptor now strips `/api/v1/` first (or `/api/`), preventing duplicate path segments.

---

## 2. Git Status and Safeguard Compliance

### 2.1 Initial Git Status
```
## main...origin/main [ahead 8, behind 1]
HEAD: eea2f35fb2dfe9fd8cf7f0bc1d063b1d267135ce
Staged deletion: Documentation/atlas-credentials.env
Unstaged changes: Directive 017 crop disease detection removal & past reports
```

### 2.2 Final Git Status
```
## main...origin/main [ahead 8, behind 1]
HEAD: eea2f35fb2dfe9fd8cf7f0bc1d063b1d267135ce
```
All Directive 017 disease-removal changes and Directives 010–016 blockchain changes remain fully intact in the working tree. Zero git commits, resets, rebases, or cleans were executed.

### 2.3 Strict Safeguards Verification
| Safeguard Item | Enforced? | Details |
| :--- | :---: | :--- |
| No Destructive Git Commands | YES | No `git reset`, `git clean`, `git checkout .`, or `git rebase` |
| No Unapproved Commits or Pushes | YES | No `git commit` or `git push` executed |
| No Live Deployment | YES | No Render deployment initiated or API keys contacted |
| No Production DB Modification | YES | No `prisma db push`, `prisma migrate`, or live queries run |
| Secrets Masked / Hidden | YES | Zero credentials, private keys, or passwords logged; env vars referenced by name only |
| Passwords Reset Script Not Run | YES | `apps/backend/reset-passwords.js` untouched and unexecuted |
| No Blockchain Public RPC Calls | YES | Tests ran against local mocked and in-memory nodes only |
| Provider Preservation | YES | Render architecture retained as specified in `render.yaml` |

---

## 3. Actual Service Architecture & Configuration

The repository is structured as an npm workspaces monorepo with accompanying Python microservices. The Render blueprint in `render.yaml` defines four services:

```
                                  [ Browser / Client ]
                                           │
                        ┌──────────────────┴──────────────────┐
                        ▼                                     ▼
             [ agrotrace-web ]                     [ agrotrace-backend ]
             (Static Site: SPA)                    (Node.js Web Service)
             Port: N/A (CDN)                       Port: 10000 / $PORT
             Vite React Frontend                   Express REST API
                        │                                     │
                        │ API calls                           ├── Proxy & Anchoring
                        └────────────────────────────────────►│
                                                              ├──► [ agrotrace-ai-service ]
                                                              │    (FastAPI Web Service)
                                                              │    Port: 10000 / $PORT
                                                              │    - Weather backfill
                                                              │    - Satellite NDVI
                                                              │    - Crop/Fertilizer advisor
                                                              │
                                                              └──► [ agrotrace-ml-inference ]
                                                                   (FastAPI Web Service)
                                                                   Port: 10000 / $PORT
                                                                   - LightGBM Yield prediction
                                                                   - XGBoost Crop recommendation
                                                                   - NDVI health analysis
```

### 3.1 Service Inventory & Build Specifications

| Service Name | Type / Runtime | Root Directory | Build Command | Start Command | Health Check |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `agrotrace-backend` | Web / Node | `.` (Repo Root) | `npm install && npm run build` | `NODE_ENV=production npm run start` | `/health` |
| `agrotrace-ai-service` | Web / Python 3.10 | `services/ai-service` | `pip install -r requirements.txt` | `uvicorn main:app --host 0.0.0.0 --port $PORT` | `/health` |
| `agrotrace-ml-inference` | Web / Python 3.10 | `apps/ml-inference` | `pip install -r requirements.txt` | `uvicorn main:app --host 0.0.0.0 --port $PORT` | `/health` |
| `agrotrace-web` | Static / HTML/JS | `apps/web` | `npm install && npm install @esbuild/linux-x64 @rollup/rollup-linux-x64-gnu && npm run build` | Static Publish: `dist`, SPA rewrite `/* -> /index.html` | N/A |

### 3.2 Database Configuration & Safety
- **Database Engine:** MongoDB Atlas via Prisma Client (`packages/prisma/schema.prisma`).
- **Build / Startup Safety:** The root `package.json` build command executes `npm run db:generate && npm run build -w @agritrace/backend`.
  - `npm run db:generate` calls `cd packages/prisma && npx prisma generate`. This **only** generates the local TypeScript client code.
  - It does NOT connect to MongoDB or run schema push operations.
  - Destructive commands (`npx prisma db push --force-reset` or similar) are strictly absent from all Render commands.

### 3.3 Blockchain Startup Fault-Tolerance
- `apps/backend/src/services/provenanceListener.ts`:
  - Automatically skips the background listener when `RPC_URL` is omitted in production (`NODE_ENV === 'production'`).
  - Registers an error handler (`provider.on('error', ...)`) to prevent transient network errors or down RPCs from crashing the Node.js process.
- `apps/backend/src/services/blockchain.service.ts`:
  - Falls back cleanly to simulated/unanchored records when contracts or networks are unconfigured.

---

## 4. Audit of Historical Login & CORS Issues

### 4.1 Historical URLs
- **Frontend Origin:** `https://agrotrace-web.onrender.com`
- **Backend Origin:** `https://agrotrace-backend.onrender.com`

### 4.2 Root Causes of Past Cross-Origin Login Failures
1. **Express CORS Middleware Strict Equality Failure:**
   - Previous code:
     ```typescript
     const allowedOrigins = [process.env.CORS_ORIGIN, process.env.FRONTEND_URL, ...];
     if (allowedOrigins.includes(origin)) return callback(null, true);
     return callback(new Error('Not allowed by CORS'));
     ```
   - In Render, users frequently enter `https://agrotrace-web.onrender.com/` (with a trailing slash) as the `CORS_ORIGIN` environment variable. The browser sends `Origin: https://agrotrace-web.onrender.com` (browsers never include a trailing slash in the `Origin` header).
   - This caused `allowedOrigins.includes(origin)` to evaluate to `false`.
   - Passing `new Error('Not allowed by CORS')` to the callback caused Express's global error handler to intercept the preflight `OPTIONS` request and return `500 Internal Server Error` with `{"success": false, "message": "Internal server error"}`. The browser console reported this as a CORS preflight failure because the status was not 2xx.
2. **Cookie vs. Bearer Token Authentication Priority:**
   - Previous code in `apps/backend/src/middleware/auth.ts`:
     ```typescript
     let token = req.cookies?.token;
     if (!token && authHeader && authHeader.startsWith('Bearer ')) {
       token = authHeader.replace('Bearer ', '');
     }
     ```
   - The frontend stores the JWT in `localStorage` upon login and sends it via Axios interceptors in `Authorization: Bearer <token>`.
   - If a client previously visited the backend or had a stale cookie from a previous deployment (where Render generated a new `JWT_SECRET`), `req.cookies?.token` was prioritized over the fresh Bearer token in the `Authorization` header.
   - When the backend attempted to verify the stale cookie, `jwt.verify` threw `TokenExpiredError` or `JsonWebTokenError: invalid signature`, rejecting authenticated requests with 401 even though the user had just logged in.
3. **Cross-Origin Cookie Configuration (`SameSite` / `Secure`):**
   - In `apps/backend/src/controllers/auth.controller.ts`, cookie options use:
     ```typescript
     const getCookieOptions = () => ({
       httpOnly: true,
       secure: process.env.NODE_ENV === 'production',
       sameSite: process.env.NODE_ENV === 'production' ? ('none' as const) : ('lax' as const),
     });
     ```
   - In cross-origin production environments (`agrotrace-web.onrender.com` calling `agrotrace-backend.onrender.com`), cookies require `sameSite: 'none'` and `secure: true`. Browsers like Safari and Chrome Incognito frequently block third-party cookies regardless. Giving `Authorization: Bearer <token>` primary precedence guarantees authentication succeeds regardless of browser cookie blocking policies.

---

## 5. Details of Repairs Applied

### Repair 1: Authentication Middleware Token Precedence
- **File:** `apps/backend/src/middleware/auth.ts`
- **Change:** Bearer token from the `Authorization` header now takes precedence over cookies.
```typescript
const authHeader = req.headers.authorization;
let token: string | undefined;

// Bearer token from header takes precedence over cookie
if (authHeader && authHeader.startsWith('Bearer ')) {
  token = authHeader.replace('Bearer ', '').trim();
} else if (req.cookies?.token) {
  token = req.cookies.token;
}
```

### Repair 2: CORS Origin Normalization and Preflight Error Prevention
- **File:** `apps/backend/src/server.ts`
- **Change:**
  1. Configured origins are normalized by stripping trailing slashes.
  2. `https://agrotrace-web.onrender.com` is explicitly built-in alongside `http://127.0.0.1` and `http://localhost`.
  3. Render preview subdomains matching `^https:\/\/agrotrace-web(-[a-z0-9-]+)?\.onrender\.com$` are supported.
  4. Disallowed origins invoke `callback(null, false)` instead of throwing an Error, ensuring Express cleanly omits CORS headers without producing 500 errors on OPTIONS preflights.

### Repair 3: Multi-Service Python URL Routing in Backend
- **Files:** `apps/backend/src/routes/prediction.routes.ts` & `apps/backend/src/services/ml.service.ts`
- **Change:** Switched endpoints served by `apps/ml-inference` (`/yield/predict-yield`, `/recommend/crop`, and `/health/ndvi-health`) from `AI_SERVICE_URL` to `ML_SERVICE_URL`:
```typescript
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || process.env.AI_SERVICE_URL || 'http://localhost:8000';
```

### Repair 4: Standard Health Route on ML Inference Service
- **File:** `apps/ml-inference/main.py`
- **Change:** Added `@app.get("/health")` returning `{"status": "healthy", "service": "AgroTrace ML Inference Service"}`.

### Repair 5: Frontend API URL Prefix Deduplication
- **File:** `apps/web/src/services/api.ts`
- **Change:** Request interceptor now inspects and strips both `/api/v1/` and `/api/` prefixes idempotently.

### Repair 6: Render Deployment Specification Updates
- **File:** `render.yaml`
- **Change:**
  1. Added `healthCheckPath: /health` for `agrotrace-ai-service` and `agrotrace-ml-inference`.
  2. Added `FRONTEND_URL` and `AGMARKNET_API_KEY` to `agrotrace-backend` environment variables.

### Repair 7: Environment Example File Updates
- **Files:** `.env.example` & `apps/backend/.env.example`
- **Change:** Added `ML_SERVICE_URL`, `FRONTEND_URL`, and `AGMARKNET_API_KEY` to the documented variable list.

---

## 6. Execution and Verification Results

### 6.1 Frontend Production Build
- **Command:** `npm run build` in `apps/web`
- **Result:** PASSED (Exit code: 0)
- **Artifacts:**
  - `dist/index.html` (2.13 kB)
  - `dist/assets/index-Bi-bNKDK.css` (106.00 kB)
  - `dist/assets/index.es-zJlXGTfO.js` (150.69 kB)
  - `dist/assets/index-D3Q68lHJ.js` (1,993.51 kB)
  - Zero TypeScript or bundling errors.

### 6.2 Backend Production Build
- **Command:** `npm run build` in `apps/backend` (`tsc`)
- **Result:** PASSED (Exit code: 0, zero compilation errors)

### 6.3 Backend Automated Test Suites
- **Command:** `npx jest` in `apps/backend`
- **Summary:**
  - `security_containment.test.ts`: 28 passed, 0 failed
  - `blockchain_directive014_amoy_isolation.test.ts`: 8 passed, 0 failed
  - `blockchain_directive015_safety_gate.test.ts`: 12 passed, 0 failed
  - `blockchain_lifecycle_persistence.test.ts`: 13 passed, 0 failed
  - `blockchain_local_e2e.test.ts`: 10 passed, 0 failed
  - `blockchain_integration.test.ts`: 20 passed, 0 failed
  - **Total Tests Passed:** 91 / 91 passed across all suites.

### 6.4 AI & ML Service Verification
- **AI Service Retained Models:**
  - **Command:** `python test_model.py` in `services/ai-service`
  - **Result:** PASSED (Exit code: 0)
  - `YieldPredictor`: 1178.75 kg predicted, 60.6% confidence.
  - `CropAdvisor`: Recommends coffee based on soil/climate conditions.
  - `FertilizerAdvisor`: Recommends Urea.
- **ML Inference Service Retained Models:**
  - **Yield Service (`predict_yield`):** Successfully executed LightGBM prediction (`predicted_yield_kg: 1589.68`, confidence `High`).
  - **NDVI Service (`get_ndvi_for_area`):** Successfully calculated simulated NDVI reading (`ndviScore: 0.816`, `source: SIMULATED_MOCK`).

### 6.5 Disease Detection Removal Verification
- **Codebase Grep Scan:**
  - `apps/web/src`: Zero crop disease detection components, routes, or pages remain (`DiseaseDetection.tsx` confirmed deleted).
  - `apps/backend/src/routes`: Zero disease detection routes exist.
  - `services/ai-service/models`: `disease_predictor.py` confirmed deleted.
  - PyTorch dependencies removed from `services/ai-service/requirements.txt`.

### 6.6 CORS & Auth Precedence Unit Simulation
- **CORS Matching:**
  - Tested `https://agrotrace-web.onrender.com`: PASS
  - Tested `https://agrotrace-web.onrender.com/` (trailing slash): PASS
  - Tested `https://agrotrace-web-pr-12.onrender.com` (preview): PASS
  - Tested `https://evil-site.com`: REJECTED (PASS)
- **Auth Precedence:**
  - Fresh header + expired cookie: Header won (PASS)
  - Header only: Header won (PASS)
  - Cookie only: Cookie won (PASS)
  - Neither: 401 Authentication required (PASS)

---

## 7. Required Render Environment Variables (By Name Only)

The following environment variables must be configured in the Render Dashboard for each service. **No secret values are shown.**

### 7.1 `agrotrace-backend` (Node Web Service)
| Variable Name | Required? | Purpose / Description |
| :--- | :---: | :--- |
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | Yes | Set to `10000` (Render default) |
| `DATABASE_URL` | Yes | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes | Shared secret for signing user JWT tokens (must match `agrotrace-ai-service`) |
| `AI_SERVICE_URL` | Yes | Points to `https://agrotrace-ai-service.onrender.com` |
| `ML_SERVICE_URL` | Yes | Points to `https://agrotrace-ml-inference.onrender.com` |
| `CORS_ORIGIN` | Yes | Points to `https://agrotrace-web.onrender.com` |
| `FRONTEND_URL` | Optional | Points to `https://agrotrace-web.onrender.com` |
| `BLOCKCHAIN_NETWORK` | Optional | Set to `amoy` (or `local` if simulated) |
| `RPC_URL` | Optional | Polygon Amoy testnet RPC provider URL |
| `CONTRACT_OWNER_PRIVATE_KEY` | Optional | Relayer wallet private key for on-chain anchoring |
| `TRACEABILITY_CONTRACT_ADDRESS`| Optional | Deployed AgroTraceRegistry contract address |
| `PROVENANCE_CONTRACT_ADDRESS` | Optional | Deployed PredictionProvenance contract address |
| `STRIPE_SECRET_KEY` | Optional | Stripe secret key for payment processing |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe webhook signing secret |
| `OPENWEATHER_API_KEY` | Optional | OpenWeatherMap API key for live weather data |
| `AGMARKNET_API_KEY` | Optional | Agmarknet API key for live mandi commodity prices |

### 7.2 `agrotrace-ai-service` (Python Web Service)
| Variable Name | Required? | Purpose / Description |
| :--- | :---: | :--- |
| `PYTHON_VERSION` | Yes | Set to `3.10.14` |
| `PORT` | Yes | Set to `10000` |
| `JWT_SECRET` | Yes | Must match the `JWT_SECRET` configured in `agrotrace-backend` |
| `NDVI_SIMULATION_MODE` | Optional | Set to `"true"` (avoids requiring Google Earth Engine credentials) |
| `EARTH_ENGINE_PROJECT_ID` | Optional | Google Earth Engine project ID if simulation is disabled |

### 7.3 `agrotrace-ml-inference` (Python Web Service)
| Variable Name | Required? | Purpose / Description |
| :--- | :---: | :--- |
| `PYTHON_VERSION` | Yes | Set to `3.10.14` |
| `PORT` | Yes | Set to `10000` |

### 7.4 `agrotrace-web` (Static Site)
| Variable Name | Required? | Purpose / Description |
| :--- | :---: | :--- |
| `VITE_BACKEND_URL` | Yes | Points to `https://agrotrace-backend.onrender.com` |
| `VITE_API_URL` | Yes | Points to `https://agrotrace-backend.onrender.com` |
| `VITE_AI_SERVICE_URL` | Optional | Points to `https://agrotrace-ai-service.onrender.com` |

---

## 8. Remaining Blockers & Steps Requiring Live Access

The following steps cannot and should not be completed locally; they require authorized access to the production Render account:
1. **Render Blueprint Sync / Service Creation:** Triggering the live Render build from git requires pushing to the remote repository and initiating the sync in the Render Dashboard.
2. **MongoDB Atlas IP Access List:** If MongoDB Atlas uses IP access restrictions, Render's static outbound IP addresses (or `0.0.0.0/0` with strong authentication) must be allowlisted in the Atlas cluster.
3. **Synchronized Secret Configuration:** Ensuring `JWT_SECRET` is populated with identical values on both `agrotrace-backend` and `agrotrace-ai-service`.
4. **Third-Party API Credentials:** Populating live production keys for Stripe, OpenWeatherMap, Agmarknet, and Polygon Amoy testnet RPC.

---

## 9. Final Sign-Off & Confirmation

- [x] Initial and final Git status inspected and documented.
- [x] All existing work, Directive 017 crop disease detection removal, and Directives 010–016 blockchain implementations preserved.
- [x] Zero Git commits, pushes, rebases, or destructive checkouts occurred.
- [x] Zero production database migrations or data modifications occurred.
- [x] Zero secrets or credentials exposed.
- [x] Zero public blockchain RPC transactions or contract deployments executed.
- [x] `apps/backend/reset-passwords.js` remained unexecuted.
- [x] All 6 minimal code and configuration repairs verified with production builds and 91 automated tests.
- [x] Completed and submitted for Project Lead review.
