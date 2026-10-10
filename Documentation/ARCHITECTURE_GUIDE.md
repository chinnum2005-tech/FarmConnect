# 🌾 FarmConnect - Complete System Architecture Guide

## Full-Stack Agriculture Traceability Platform

---

## 📋 Table of Contents

1. [Project Structure](#project-structure)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Component Details](#component-details)
5. [Data Flow](#data-flow)
6. [API Endpoints](#api-endpoints)
7. [Blockchain Integration](#blockchain-integration)
8. [QR Code System](#qr-code-system)
9. [AI Service](#ai-service)
10. [Deployment Guide](#deployment-guide)

---

## 🏗️ Project Structure

```
FarmConnect/
│
├── apps/
│   ├── web/                          # React Frontend (Vite + TypeScript)
│   │   ├── src/
│   │   │   ├── components/           # Reusable UI Components
│   │   │   │   ├── Navbar.tsx        # Top navigation bar
│   │   │   │   ├── Sidebar.tsx       # Dashboard sidebar
│   │   │   │   ├── Card.tsx          # Card component
│   │   │   │   ├── Timeline.tsx      # Product journey timeline
│   │   │   │   ├── BlockchainBadge.tsx  # Verification badge
│   │   │   │   └── QRScanner.tsx     # QR code scanner
│   │   │   │
│   │   │   ├── pages/                # Application Pages
│   │   │   │   ├── Landing.tsx       # Public landing page
│   │   │   │   ├── FarmerDashboard.tsx    # Farmer interface
│   │   │   │   ├── SupplyChainDashboard.tsx  # Distributor interface
│   │   │   │   ├── AdminDashboard.tsx     # Admin interface
│   │   │   │   └── Verify.tsx        # Consumer verification
│   │   │   │
│   │   │   ├── services/             # API Services
│   │   │   │   └── api.ts            # Axios instance + endpoints
│   │   │   │
│   │   │   ├── types.ts              # TypeScript types
│   │   │   ├── App.tsx               # Main app component
│   │   │   └── main.tsx              # Entry point
│   │   │
│   │   ├── public/
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tailwind.config.js
│   │   └── vite.config.ts
│   │
│   ├── backend/                      # Node.js Backend (Express + TypeScript)
│   │   ├── src/
│   │   │   ├── controllers/          # Business Logic
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── farm.controller.ts
│   │   │   │   ├── crop.controller.ts
│   │   │   │   └── verify.controller.ts
│   │   │   │
│   │   │   ├── routes/               # API Routes
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── farm.routes.ts
│   │   │   │   ├── crop.routes.ts
│   │   │   │   ├── verify.routes.ts
│   │   │   │   └── qrRoutes.ts       # QR generation routes
│   │   │   │
│   │   │   ├── services/             # Core Services
│   │   │   │   ├── qrService.ts      # QR code generation
│   │   │   │   └── blockchainService.ts  # Blockchain integration
│   │   │   │
│   │   │   ├── middleware/           # Express Middleware
│   │   │   │   ├── auth.ts           # JWT authentication
│   │   │   │   ├── validator.ts      # Request validation
│   │   │   │   └── errorHandler.ts   # Error handling
│   │   │   │
│   │   │   ├── database/             # Database Layer
│   │   │   │   └── prisma.ts         # Prisma client
│   │   │   │
│   │   │   └── server.ts             # Express app setup
│   │   │
│   │   ├── prisma/
│   │   │   └── schema.prisma         # Database schema
│   │   │
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── mobile/                       # Flutter Mobile App (Future)
│       ├── lib/
│       │   ├── screens/
│       │   ├── services/
│       │   └── main.dart
│       └── pubspec.yaml
│
├── packages/                         # Shared Packages
│   └── prisma/                       # Database Schema & Migrations
│       ├── schema.prisma
│       ├── seed.ts                   # Database seeding
│       └── package.json
│
├── services/                         # Microservices
│   ├── ai-service/                   # Python AI Service (FastAPI)
│   │   ├── models/
│   │   │   └── yield_predictor.py    # ML model
│   │   ├── main.py                   # FastAPI app
│   │   ├── requirements.txt
│   │   └── README.md
│   │
│   └── blockchain/                   # Smart Contracts (Hardhat)
│       ├── contracts/
│       │   └── SupplyChain.sol       # Solidity contract
│       ├── scripts/
│       │   └── deploy.ts             # Deployment script
│       ├── test/
│       │   └── SupplyChain.test.ts   # Contract tests
│       ├── hardhat.config.ts
│       └── package.json
│
├── docker-compose.yml                # Docker orchestration
├── .env                              # Environment variables
├── .env.example                      # Example env file
├── package.json                      # Root package (workspaces)
└── turbo.json                        # Turborepo config
```

---

## 🔗 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Web App    │  │  Mobile App  │  │  Admin Panel │      │
│  │  (React)     │  │  (Flutter)   │  │  (React)     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      API GATEWAY                             │
│                    (Express.js API)                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Authentication | Authorization | Rate Limiting       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC LAYER                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Farms   │  │  Crops   │  │   QR     │  │  Supply  │    │
│  │ Controller│ │ Controller│ │ Service  │  │  Chain   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                     DATA ACCESS LAYER                        │
│                     (Prisma ORM)                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                       DATABASE                               │
│                   (PostgreSQL)                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │    AI    │  │Blockchain│  │   QR     │                  │
│  │  Service │  │ Polygon  │  │ Generator│                  │
│  │ (FastAPI)│  │(Solidity)│  │(qrcode)  │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 💻 Technology Stack

### Frontend (Web)
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 5
- **Styling**: TailwindCSS 3
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **HTTP Client**: Axios
- **Routing**: React Router v6
- **QR Generation**: qrcode.react
- **Charts**: Recharts

### Backend (API)
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **ORM**: Prisma 5
- **Database**: PostgreSQL 15
- **Authentication**: JWT (jsonwebtoken)
- **Validation**: Zod
- **Security**: Helmet, CORS, Rate Limiter
- **QR Library**: qrcode

### Blockchain
- **Platform**: Polygon (Mumbai Testnet)
- **Smart Contracts**: Solidity 0.8
- **Development**: Hardhat
- **Testing**: Chai + Mocha

### AI Service
- **Framework**: FastAPI
- **Language**: Python 3.11
- **ML Library**: scikit-learn
- **Data Processing**: pandas, numpy
- **Model Persistence**: joblib

### DevOps
- **Containerization**: Docker
- **Orchestration**: Docker Compose
- **CI/CD**: GitHub Actions (future)
- **Monitoring**: (future integration)

---

## 📦 Component Details

### 1. Frontend Components

#### **Landing Page** (`Landing.tsx`)
- Hero section with gradient background
- Feature cards (Blockchain, AI, Transparency)
- How It Works section
- Call-to-action buttons
- Responsive navbar and footer

#### **Farmer Dashboard** (`FarmerDashboard.tsx`)
- Stats cards (Total Batches, Verified, Pending)
- Crop batch management table
- QR code generation modal
- Blockchain verification status
- Quick action buttons

#### **Supply Chain Dashboard** (`SupplyChainDashboard.tsx`)
- Active shipments tracking
- Product journey timeline
- Transport logs
- Temperature monitoring
- Status update forms

#### **Admin Dashboard** (`AdminDashboard.tsx`)
- System metrics overview
- User management
- Blockchain transaction monitor
- Analytics and reports
- System health checks

#### **Verify Page** (`Verify.tsx`)
- QR code input/scanner
- Product details display
- Animated journey timeline
- Blockchain verification badge
- Farm origin information

### 2. Backend Services

#### **QR Service** (`qrService.ts`)
```typescript
export async function generateQRCode(
  data: string,
  options?: {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  }
): Promise<string>
```
- Generates high-quality QR codes
- Supports URL and text formats
- Returns Base64 PNG images
- Configurable error correction

#### **Blockchain Service** (`blockchainService.ts`)
```typescript
export async function recordEvent(
  productId: string,
  eventType: string,
  metadata: string
): Promise<string> // Returns transaction hash
```
- Connects to Polygon network
- Deploys smart contracts
- Records supply chain events
- Retrieves event history

### 3. Database Schema

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  firstName String
  lastName  String
  role      Role     @default(FARMER)
  farms     Farm[]
  createdAt DateTime @default(now())
}

model Farm {
  id        String   @id @default(uuid())
  name      String
  location  String
  farmerId  String
  farmer    User     @relation(fields: [farmerId], references: [id])
  crops     Crop[]
  createdAt DateTime @default(now())
}

model Crop {
  id           String      @id @default(uuid())
  name         String
  type         CropType
  area         Float
  plantedAt    DateTime
  growthStage  GrowthStage @default(PLANTED)
  farmId       String
  farm         Farm        @relation(fields: [farmId], references: [id])
  supplyChain  SupplyChain[]
  createdAt    DateTime    @default(now())
}

model SupplyChain {
  id          String   @id @default(uuid())
  cropId      String
  crop        Crop     @relation(fields: [cropId], references: [id])
  eventType   EventType
  timestamp   DateTime
  metadata    String?
  txHash      String?  // Blockchain transaction hash
  createdAt   DateTime @default(now())
}
```

---

## 🔄 Data Flow

### Complete FarmConnect Workflow

```
1. Farmer Registration
   ┌────────────┐
   │   Farmer   │
   └────┬───────┘
        │ Register Account
        ↓
   ┌────────────┐
   │  Backend   │ → Create User (JWT Token)
   └────┬───────┘
        │
        ↓
   ┌────────────┐
   │ PostgreSQL │ ← Store User
   └────────────┘

2. Farm & Crop Creation
   ┌────────────┐
   │   Farmer   │
   └────┬───────┘
        │ Add Farm + Crop
        ↓
   ┌────────────┐
   │  Backend   │ → Validate Data
   └────┬───────┘
        │
        ↓
   ┌────────────┐
   │ PostgreSQL │ ← Store Farm & Crop
   └────────────┘

3. QR Code Generation
   ┌────────────┐
   │   Farmer   │
   └────┬───────┘
        │ Click "Generate QR"
        ↓
   ┌────────────┐
   │  Backend   │ → Generate QR (Base64)
   └────┬───────┘
        │
        ↓
   ┌────────────┐
   │   Frontend │ ← Display QR Modal
   └────────────┘

4. Supply Chain Updates
   ┌─────────────┐
   │ Distributor │
   └─────┬───────┘
         │ Update Status
         ↓
   ┌────────────┐
   │  Backend   │ → Record Event
   └────┬───────┘
        │
        ├──────────────┐
        ↓              ↓
   ┌────────────┐  ┌────────────┐
   │ PostgreSQL │  │ Blockchain │
   └────────────┘  └────────────┘

5. Consumer Verification
   ┌────────────┐
   │  Consumer  │
   └────┬───────┘
        │ Scan QR Code
        ↓
   ┌────────────┐
   │   Verify   │ → Fetch Product Data
   └────┬───────┘
        │
        ├──────────────┐
        ↓              ↓
   ┌────────────┐  ┌────────────┐
   │ PostgreSQL │  │ Blockchain │
   └────────────┘  └────────────┘
        │
        ↓
   ┌────────────┐
   │  Timeline  │ ← Display Journey
   └────────────┘
```

---

## 🌐 API Endpoints

### Authentication
```
POST   /api/auth/register     - Register new user
POST   /api/auth/login        - Login user
POST   /api/auth/logout       - Logout user
GET    /api/auth/profile      - Get user profile
```

### Farms
```
GET    /api/farms             - Get all farms (admin)
GET    /api/farms/my-farm     - Get farmer's farms
POST   /api/farms             - Create new farm
PUT    /api/farms/:id         - Update farm
DELETE /api/farms/:id         - Delete farm
```

### Crops
```
GET    /api/crops             - Get all crops (admin)
GET    /api/crops/my-crops    - Get farmer's crops
POST   /api/crops             - Create new crop
PUT    /api/crops/:id         - Update crop
PATCH  /api/crops/:id/stage   - Update growth stage
DELETE /api/crops/:id         - Delete crop
GET    /api/crops/:id/predict - Get AI prediction
```

### QR Codes
```
POST   /api/qr/generate       - Generate QR code
GET    /api/qr/:cropId        - Get QR code
```

### Supply Chain
```
GET    /api/supply-chain              - Get all events
POST   /api/supply-chain              - Record new event
GET    /api/supply-chain/crop/:id     - Get crop events
PUT    /api/supply-chain/:id          - Update event
```

### Verification
```
GET    /api/verify/:qrCode    - Verify product
POST   /api/verify/generate/:id - Generate verification QR
```

---

## ⛓️ Blockchain Integration

### Smart Contract (SupplyChain.sol)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SupplyChain {
    
    struct Event {
        string productId;
        string eventType;
        uint256 timestamp;
        string metadata;
        address recordedBy;
    }
    
    mapping(string => Event[]) public events;
    mapping(address => bool) public authorizedUsers;
    
    event EventRecorded(
        string indexed productId,
        string eventType,
        uint256 timestamp,
        address recordedBy
    );
    
    modifier onlyAuthorized() {
        require(authorizedUsers[msg.sender], "Not authorized");
        _;
    }
    
    constructor() {
        authorizedUsers[msg.sender] = true;
    }
    
    function authorizeUser(address user) public onlyAuthorized {
        authorizedUsers[user] = true;
    }
    
    function recordEvent(
        string memory productId,
        string memory eventType,
        string memory metadata
    ) public onlyAuthorized returns (uint256) {
        events[productId].push(
            Event({
                productId: productId,
                eventType: eventType,
                timestamp: block.timestamp,
                metadata: metadata,
                recordedBy: msg.sender
            })
        );
        
        emit EventRecorded(
            productId,
            eventType,
            block.timestamp,
            msg.sender
        );
        
        return events[productId].length - 1;
    }
    
    function getEvents(string memory productId)
        public
        view
        returns (Event[] memory)
    {
        return events[productId];
    }
    
    function getEventCount(string memory productId)
        public
        view
        returns (uint256)
    {
        return events[productId].length;
    }
}
```

### Deployment Steps

1. **Install Dependencies**
```bash
cd services/blockchain
npm install
```

2. **Configure Network**
```bash
# Edit hardhat.config.ts / hardhat.config.js
networks: {
  amoy: {
    url: process.env.POLYGON_RPC_URL,
    accounts: [process.env.AMOY_DEPLOYER_PRIVATE_KEY]
  }
}
```

3. **Deploy Contract**
```bash
npx hardhat run scripts/deploy.js --network amoy
```

4. **Configure Backend Runtime**
- Set deployed contract address: `AGROTRACE_REGISTRY_ADDRESS=0x...`
- Set canonical relayer key: `RELAYER_PRIVATE_KEY=0x...` (strictly required on Polygon Amoy; Hardhat default dev keys prohibited)
- Set expected relayer address for validation: `AMOY_RELAYER_ADDRESS=0x...` (canonical; `RELAYER_ADDRESS` supported as alias)
- **Signer Identity & Role Preflight Validation**:
  - The derived wallet address from `RELAYER_PRIVATE_KEY` must strictly match `AMOY_RELAYER_ADDRESS`.
  - Before any state-changing transaction (`registerBatch` or `recordEvent`), the service executes an on-chain read-only authorization preflight query: `hasRole(RELAYER_ROLE, signerAddress)`.
  - The service fails closed and submits zero transactions if the address is missing, malformed, mismatched, the role check evaluates to `false`, or the RPC query fails.
  - Successful authorization is cached per `(chainId, contractAddress, signerAddress)` to minimize RPC latency.
  - A consistent role preflight safeguard is enforced for the AI prediction provenance subsystem (`WRITER_ROLE` on `PredictionProvenance`).

---

## 📱 QR Code System

### QR Generation Flow

```
Farmer Dashboard
      ↓
Click "Generate QR"
      ↓
POST /api/qr/generate
      ↓
Backend (qrService.ts)
      ↓
QRCode.toDataURL(cropId)
      ↓
Return Base64 PNG
      ↓
Frontend displays in modal
```

### QR Verification Flow

```
Consumer scans QR
      ↓
Opens: /verify/{cropId}
      ↓
GET /api/verify/{cropId}
      ↓
Backend fetches:
  - Crop details (PostgreSQL)
  - Supply chain events (PostgreSQL)
  - Blockchain events (Polygon)
      ↓
Combine and return data
      ↓
Display animated timeline
```

### QR Code Format

**Content Options:**
1. **URL Format** (Recommended)
   ```
   http://localhost:5173/verify/1
   ```

2. **Text Format**
   ```
   FARMCONNECT-1
   ```

**Specifications:**
- Size: 400x400px (scalable)
- Error Correction: Level H (30% recovery)
- Format: PNG (Base64)
- Margin: 2 modules

---

## 🤖 AI Service

### Yield Prediction Model

**Features Used:**
- Crop type
- Area (hectares)
- Rainfall (mm)
- Temperature (°C)
- Soil pH level
- Nitrogen content
- Phosphorus content
- Potassium content

**Algorithm:** Random Forest Regressor

### API Endpoint

```python
# POST /predict/yield
{
  "cropType": "RICE",
  "area": 5.2,
  "rainfall": 1200,
  "soilQuality": {
    "ph": 6.5,
    "nitrogen": 50,
    "phosphorus": 30,
    "potassium": 40
  }
}

# Response
{
  "predictedYield": 4.5,  # tons/hectare
  "confidence": 0.87
}
```

### Integration with Main App

```typescript
// Frontend calls AI service via backend
const prediction = await cropService.getPrediction(cropId);
// Shows expected yield in dashboard
```

---

## 🚀 Deployment Guide

### Local Development

1. **Clone Repository**
```bash
git clone <repo-url>
cd FarmConnect
```

2. **Install Dependencies**
```bash
npm install
```

3. **Setup Environment**
```bash
cp .env.example .env
# Edit .env with your values
```

4. **Setup Database**
```bash
cd packages/prisma
npx prisma migrate dev
npx prisma generate
npx ts-node seed.ts
```

5. **Start All Services**
```bash
# Root directory
npm run dev
```

### Docker Deployment

```bash
# Start all containers
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all
docker-compose down
```

### Production Checklist

- [ ] Set strong JWT_SECRET
- [ ] Configure production database URL
- [ ] Setup SSL certificates
- [ ] Configure CORS for production domain
- [ ] Enable rate limiting
- [ ] Setup logging (Winston/Morgan)
- [ ] Configure monitoring
- [ ] Backup strategy
- [ ] CI/CD pipeline

---

## 🎯 Key Features Summary

### ✅ Implemented Features

1. **Multi-Role Dashboards**
   - Farmer Dashboard (crop management)
   - Distributor Dashboard (supply chain)
   - Admin Dashboard (system monitoring)

2. **QR Code System**
   - Generate QR codes for crops
   - Beautiful modal display
   - Download functionality
   - Consumer verification page

3. **Product Journey Timeline**
   - Animated vertical timeline
   - Status indicators (colors)
   - Icons for each event type
   - Timestamps with dates/times

4. **Blockchain Integration**
   - Smart contract deployed on Mumbai
   - Event recording on-chain
   - Transaction hash storage
   - Verification badge display

5. **Professional UI/UX**
   - Agricultural color theme
   - Smooth animations (Framer Motion)
   - Responsive design
   - Loading states
   - Error handling

6. **Security Features**
   - JWT authentication
   - Role-based access control
   - Input validation (Zod)
   - Rate limiting
   - Helmet security

---

## 🌟 Demo Flow (3 Minutes)

### Minute 1: Introduction
- Show landing page
- Explain problem: Food fraud, lack of transparency
- Introduce FarmConnect solution

### Minute 2: Live Demo
- Login as farmer
- Show dashboard with crops
- Click "Generate QR" → Modal appears
- Explain blockchain integration

### Minute 3: Consumer Experience
- Open verification page (incognito)
- Enter product ID
- Show beautiful animated timeline
- Point out blockchain verification badge
- Conclude with impact

---

## 📊 Success Metrics

### Technical Excellence
- ✅ Full-stack implementation
- ✅ Real-time data synchronization
- ✅ Blockchain integration
- ✅ QR code generation
- ✅ Professional UI/UX
- ✅ Mobile responsive

### Innovation
- ✅ Blockchain traceability
- ✅ AI yield prediction
- ✅ QR verification system
- ✅ Multi-stakeholder platform

### Impact
- ✅ Helps farmers prove authenticity
- ✅ Protects consumers from fraud
- ✅ Increases supply chain transparency
- ✅ Reduces food safety issues

---

## 🔮 Future Enhancements

1. **Mobile App** (Flutter)
   - On-the-go access for farmers
   - QR scanner integration
   - Push notifications

2. **IoT Integration**
   - Soil sensors
   - Weather stations
   - Automated data collection

3. **Advanced Analytics**
   - Market price predictions
   - Demand forecasting
   - Optimization recommendations

4. **Marketplace**
   - Direct farmer-to-consumer sales
   - Bulk ordering
   - Payment integration

5. **Certification System**
   - Organic certification tracking
   - Quality assurance badges
   - Third-party audits

---

## 📞 Support & Documentation

- **API Docs**: Available at `/api-docs`
- **GitHub Repo**: [Your Repository]
- **Issue Tracker**: GitHub Issues
- **Email**: support@farmconnect.com

---

**Built with ❤️ for Smart India Hackathon 2026**

**FarmConnect - From Farm to Fork, Transparent Always.**
