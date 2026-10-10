# FarmConnect AI - Architecture Overview

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
├──────────────────────┬──────────────────────────────────────┤
│   React Web App      │      Flutter Mobile App              │
│   (Port 5173)        │      (iOS/Android)                   │
└──────────┬───────────┴──────────────┬───────────────────────┘
           │                          │
           └──────────┬───────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway Layer                        │
│                  Express Backend (Port 3001)                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Authentication │ Authorization │ Rate Limiting       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
         ▼            ▼            ▼
┌─────────────┐ ┌──────────┐ ┌──────────────┐
│  Database   │ │   AI     │ │  Blockchain  │
│  PostgreSQL │ │ Service  │ │   Module     │
│  (5432)     │ │ (8000)   │ │  (Polygon)   │
│             │ │ FastAPI  │ │   Smart      │
│  Prisma ORM │ │ Python   │ │   Contracts  │
└─────────────┘ └──────────┘ └──────────────┘
```

## Component Details

### 1. Frontend Web Application
- **Technology**: React 18 + Vite + TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Context + Hooks
- **Routing**: React Router v6
- **Key Features**:
  - Dashboard with real-time statistics
  - Farm management interface
  - Crop lifecycle tracking
  - Supply chain visualization
  - QR code generation and verification

### 2. Mobile Application
- **Technology**: Flutter (Dart)
- **Architecture**: Provider pattern
- **Key Features**:
  - On-farm data entry
  - QR code scanning
  - Offline-first design
  - Push notifications (future)

### 3. Backend API
- **Technology**: Node.js + Express + TypeScript
- **Authentication**: JWT with bcrypt
- **Authorization**: Role-based access control (RBAC)
- **Security**: Helmet.js, CORS, Rate limiting
- **Validation**: Zod schemas
- **Endpoints**: RESTful API design

### 4. Database Layer
- **Technology**: PostgreSQL 15
- **ORM**: Prisma
- **Schema Design**: Normalized relational model
- **Key Entities**:
  - Users (with roles)
  - Farms (geolocation data)
  - Crops (growth stages)
  - Predictions (AI results)
  - Supply Chain Events (blockchain references)

### 5. AI Service
- **Technology**: Python FastAPI
- **ML Framework**: Scikit-learn
- **Model**: Random Forest Regressor
- **Features Used**:
  - Crop type encoding
  - Area measurement
  - Weather data integration
  - Soil quality metrics
- **Output**: Yield prediction with confidence score

### 6. Blockchain Module
- **Technology**: Solidity + Hardhat
- **Network**: Polygon Mumbai testnet
- **Contract Functions**:
  - recordEvent()
  - getProductEvents()
  - verifyEvent()
- **Integration**: Ethers.js in backend

## Data Flow Examples

### User Registration Flow
```
User → Web App → POST /api/auth/register 
→ Backend validates → Hash password → Create in DB 
→ Generate JWT → Return token
```

### Crop Yield Prediction Flow
```
Farmer → Requests prediction → Backend receives request
→ Fetches crop data from DB → Calls AI service API
→ AI model processes → Returns prediction
→ Saves to DB → Returns to user
```

### Supply Chain Recording Flow
```
Distributor → Submits event → Backend validates
→ Records in PostgreSQL → Calls smart contract
→ Blockchain transaction → Gets tx hash
→ Stores tx hash in DB → Returns confirmation
```

### Product Verification Flow
```
Consumer → Scans QR code → Calls /verify/:qrCode
→ Backend fetches crop + farm + events
→ Returns complete history
→ Consumer views product journey
```

## Security Architecture

### Authentication
- JWT tokens (15-minute expiry)
- Refresh tokens (7-day expiry)
- HTTP-only cookies (production)
- Bcrypt password hashing (10 rounds)

### Authorization
- Role-based middleware
- Route-level protection
- Resource ownership validation

### Data Protection
- Input validation with Zod
- SQL injection prevention (Prisma)
- XSS protection (Helmet.js)
- CORS configuration
- Rate limiting (100 req/15min)

## Scalability Considerations

### Horizontal Scaling
- Stateless backend instances
- Session data in JWT tokens
- Database connection pooling
- Load balancer ready

### Performance Optimization
- Database indexing on frequently queried fields
- Redis caching layer (future)
- CDN for static assets (future)
- API response compression

### Monitoring & Logging
- Health check endpoints
- Structured logging
- Error tracking (Sentry integration - future)
- Performance monitoring (Prometheus - future)

## Deployment Architecture

### Development
- Docker Compose for local development
- Hot reload enabled
- Verbose logging

### Production
- Containerized services (Docker)
- Kubernetes orchestration (recommended)
- CI/CD pipeline integration
- Environment-specific configurations

## Future Enhancements

1. **IoT Integration**
   - Soil sensors data ingestion
   - Weather station APIs
   - Automated irrigation systems

2. **Advanced AI**
   - Deep learning models (TensorFlow)
   - Advanced soil-nutrient predictive modeling
   - Satellite imagery analysis

3. **Mobile Features**
   - AR for farm visualization
   - Voice commands
   - Multi-language support

4. **Blockchain**
   - NFT certificates for premium products
   - Token rewards system
   - Cross-chain bridges

5. **Analytics**
   - Real-time dashboards
   - Predictive market analysis
   - Supply chain optimization

---

This architecture provides a solid foundation for a scalable, secure, and feature-rich agricultural traceability platform.
