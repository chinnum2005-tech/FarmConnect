import os
import sys

# Load .env file manually if exists
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            if line.strip() and not line.startswith("#") and "=" in line:
                key, val = line.strip().split("=", 1)
                os.environ[key.strip()] = val.strip().strip('"').strip("'")

# === Block TensorFlow BEFORE any other imports (prevents DLL crash on Windows) ===
os.environ["TRANSFORMERS_NO_TF"] = "1"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["USE_TF"] = "0"
os.environ["USE_TORCH"] = "1"
os.environ["LOKY_MAX_CPU_COUNT"] = "4" # Suppress joblib/loky CPU core warning

class _BlockTF:
    """Prevents tensorflow from being imported at all."""
    def __getattr__(self, name):
        raise ImportError("TensorFlow blocked (PyTorch-only mode)")

if 'tensorflow' not in sys.modules:
    sys.modules['tensorflow'] = _BlockTF()  # type: ignore
# =================================================================================

from fastapi import FastAPI, HTTPException, Depends, Request, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import json
import jwt
from datetime import datetime
from functools import lru_cache
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from models.yield_predictor import YieldPredictor
from models.crop_advisor import CropAdvisor
from models.fertilizer_advisor import FertilizerAdvisor
from services.weather_backfill import fetch_historical_weather_nasa
from services.satellite_ndvi import fetch_satellite_ndvi

app = FastAPI(
    title="AgriTrace AI Service",
    description="AI-powered crop yield, recommendation, and fertilizer advisory service",
    version="1.0.0"
)

# Initialize Rate Limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add CORS Middleware to allow requests from the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://127.0.0.1:5173",
        "http://192.168.1.9:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock decryption for models at rest (MED-003)
def decrypt_model_at_rest(model_path: str):
    # In a real environment, this would read an AES-encrypted .enc file 
    # from a secure volume and decrypt it into memory.
    pass

# Initialize the ML models
decrypt_model_at_rest("models/yield_model.enc")
predictor = YieldPredictor()


crop_advisor = CropAdvisor()
fertilizer_advisor = FertilizerAdvisor()


from typing import List

class PredictionRequest(BaseModel):
    cropType: str
    area: float
    rainfall: float
    soilQuality: dict
    ndviScore: Optional[float] = None
    ndviCapturedAt: Optional[str] = None
    ndviProvider: Optional[str] = None


class PredictionResponse(BaseModel):
    predictedYield: float
    confidence: float
    modelVersion: str
    ndviIncluded: bool
    dataSource: str
    factors: Dict[str, Any]


class CropRecommendationRequest(BaseModel):
    N: float
    P: float
    K: float
    ph: float
    temperature: float
    humidity: float
    rainfall: float


class CropRecommendationResponse(BaseModel):
    recommendedCrop: str
    alternatives: List[str]
    confidence: float
    modelVersion: str


class FertilizerRecommendationRequest(BaseModel):
    N: float
    P: float
    K: float
    ph: float
    cropType: str
    growthStage: str


class FertilizerRecommendationResponse(BaseModel):
    recommendedFertilizer: str
    quantity: float  # in kg/hectare
    timingWindow: str


class NDVIRequest(BaseModel):
    red: float
    nir: float


class NDVIResponse(BaseModel):
    ndviScore: float
    stressFlag: bool


class WeatherBackfillRequest(BaseModel):
    latitude: float
    longitude: float
    startDate: str
    endDate: str


class WeatherBackfillResponse(BaseModel):
    temperature: float
    rainfall: float
    humidity: float
    source: str


class SatelliteNDVIRequest(BaseModel):
    latitude: float
    longitude: float
    date: str


class SatelliteNDVIResponse(BaseModel):
    ndviScore: float
    cloudCoverPercent: Optional[float] = None
    imageDate: str
    provider: str
    metadata: Dict[str, Any]


# JWT Authentication setup
security = HTTPBearer()
JWT_SECRET = os.environ.get("JWT_SECRET", "super_secret_jwt_key_for_development")

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


@app.get("/health")
async def health_check():
    """Health check endpoint (MED-008)"""
    models_ready = predictor is not None and crop_advisor is not None and fertilizer_advisor is not None
    return {
        "status": "healthy" if models_ready else "degraded",
        "timestamp": datetime.now().isoformat(),
        "service": "AgriTrace AI Service",
        "models_loaded": models_ready
    }


@app.post("/predict/yield", response_model=PredictionResponse)
@limiter.limit("10/minute")
async def predict_yield(request: Request, prediction_request: PredictionRequest, current_user: dict = Depends(get_current_user)):
    """
    Predict crop yield based on various factors
    """
    try:
        weather_data = {
            "temperature": 25.0,
            "rainfall": prediction_request.rainfall,
            "humidity": 65.0,
        }
        
        soil_data = {
            "ph_level": prediction_request.soilQuality.get("ph", 6.5),
            "nitrogen": prediction_request.soilQuality.get("nitrogen", 50.0),
            "phosphorus": prediction_request.soilQuality.get("phosphorus", 30.0),
            "potassium": prediction_request.soilQuality.get("potassium", 40.0),
        }
        
        pred = predictor.predict(
            crop_type=prediction_request.cropType,
            area=prediction_request.area,
            planting_date=datetime.now(),
            weather=weather_data,
            soil=soil_data,
            ndvi_score=prediction_request.ndviScore,
            ndvi_provider=prediction_request.ndviProvider
        )
        
        factors = {
            "temperature": weather_data["temperature"],
            "rainfall": weather_data["rainfall"],
            "humidity": weather_data["humidity"],
            "pH": soil_data["ph_level"],
            "nitrogen": soil_data["nitrogen"],
            "phosphorus": soil_data["phosphorus"],
            "potassium": soil_data["potassium"]
        }
        if prediction_request.ndviScore is not None:
            factors["ndviScore"] = prediction_request.ndviScore
            
        return PredictionResponse(
            predictedYield=pred["yield"],
            confidence=pred["confidence"],
            modelVersion="random-forest-v1",
            ndviIncluded=pred["ndviIncluded"],
            dataSource=pred["dataSource"],
            factors=factors
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@app.post("/predict/yield/fusion-trigger", response_model=PredictionResponse)
@limiter.limit("10/minute")
async def predict_yield_fusion_trigger(request: Request, prediction_request: PredictionRequest, current_user: dict = Depends(get_current_user)):
    """
    Private endpoint called on satellite NDVI stress detection
    """
    return await predict_yield(request, prediction_request, current_user)


# Cache prediction logic internally to save compute
@lru_cache(maxsize=128)
def get_cached_prediction(crop_type: str, area: float, rainfall: float, ph: float):
    # This simulates a heavy compute or API-bound call
    weather_data = {
        "temperature": 25.0,
        "rainfall": rainfall,
        "humidity": 65.0,
    }
    soil_data = {
        "ph_level": ph,
        "nitrogen": 50.0,
        "phosphorus": 30.0,
        "potassium": 40.0,
    }
    return predictor.predict(
        crop_type=crop_type,
        area=area,
        planting_date=datetime.now(),
        weather=weather_data,
        soil=soil_data
    )



@app.post("/predict/crop", response_model=CropRecommendationResponse)
@limiter.limit("10/minute")
async def predict_crop(request: Request, recommendation_request: CropRecommendationRequest, current_user: dict = Depends(get_current_user)):
    """
    Recommend the most suitable crop based on soil and environmental conditions
    """
    try:
        rec = crop_advisor.recommend(
            n=recommendation_request.N,
            p=recommendation_request.P,
            k=recommendation_request.K,
            temp=recommendation_request.temperature,
            humidity=recommendation_request.humidity,
            ph=recommendation_request.ph,
            rainfall=recommendation_request.rainfall
        )
        alt_names = [a["crop"].upper() for a in rec["alternativeRecommendations"] if a["crop"].upper() != rec["recommendedCrop"].upper()]
        confidence = rec["alternativeRecommendations"][0]["confidence"] if rec["alternativeRecommendations"] else 0.90
        
        return CropRecommendationResponse(
            recommendedCrop=rec["recommendedCrop"].upper(),
            alternatives=alt_names,
            confidence=confidence,
            modelVersion="crop-recommendation-rf-v1"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/fertilizer", response_model=FertilizerRecommendationResponse)
@limiter.limit("10/minute")
async def predict_fertilizer(request: Request, recommendation_request: FertilizerRecommendationRequest, current_user: dict = Depends(get_current_user)):
    """
    Recommend fertilizer type and application timing based on soil nutrient status
    """
    try:
        # Map growth stage to typical quantity and timing
        growth_stage = recommendation_request.growthStage.upper()
        if growth_stage == "PLANTED":
            quantity = 120.0
            timing_window = "At Planting"
        elif growth_stage == "VEGETATIVE":
            quantity = 150.0
            timing_window = "Early Vegetative Stage"
        elif growth_stage == "FLOWERING":
            quantity = 80.0
            timing_window = "Flowering Pre-stage"
        else:
            quantity = 100.0
            timing_window = "General Top Dressing"
            
        rec = fertilizer_advisor.recommend(
            temp=25.0,
            humidity=65.0,
            moisture=35.0,
            soil_type="Loamy",
            crop_type=recommendation_request.cropType,
            n=recommendation_request.N,
            k=recommendation_request.K,
            p=recommendation_request.P
        )
        
        return FertilizerRecommendationResponse(
            recommendedFertilizer=rec["recommendedFertilizer"],
            quantity=quantity,
            timingWindow=timing_window
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ndvi", response_model=NDVIResponse)
@limiter.limit("20/minute")
async def compute_ndvi(request: Request, ndvi_request: NDVIRequest, current_user: dict = Depends(get_current_user)):
    """
    Calculate NDVI vegetation index and detect stress
    """
    denominator = ndvi_request.nir + ndvi_request.red
    if denominator == 0:
        raise HTTPException(status_code=400, detail="Invalid bands: Red + NIR cannot be zero.")
    ndvi = (ndvi_request.nir - ndvi_request.red) / denominator
    stress = ndvi < 0.3
    return NDVIResponse(
        ndviScore=round(ndvi, 4),
        stressFlag=stress
    )


@app.post("/weather/backfill", response_model=WeatherBackfillResponse)
@limiter.limit("10/minute")
async def backfill_weather(request: Request, backfill_req: WeatherBackfillRequest, current_user: dict = Depends(get_current_user)):
    """
    Fetch historical weather data for coordinates from NASA POWER API
    """
    try:
        weather = fetch_historical_weather_nasa(
            lat=backfill_req.latitude,
            lon=backfill_req.longitude,
            start_date=backfill_req.startDate,
            end_date=backfill_req.endDate
        )
        return WeatherBackfillResponse(
            temperature=weather["temperature"],
            rainfall=weather["rainfall"],
            humidity=weather["humidity"],
            source=weather["source"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ndvi/satellite-fetch", response_model=SatelliteNDVIResponse)
@limiter.limit("10/minute")
async def satellite_fetch_ndvi(request: Request, ndvi_req: SatelliteNDVIRequest, current_user: dict = Depends(get_current_user)):
    """
    Fetch Sentinel-2 NDVI imagery for coordinates on specific date
    """
    try:
        print(f"[DEBUG] headers: {dict(request.headers)}")
        print(f"[DEBUG] x-disable-simulation header: {request.headers.get('x-disable-simulation')}")
        disable_sim = request.headers.get("x-disable-simulation") == "true"
        force_sim = request.headers.get("x-force-simulation") == "true"
        print(f"[DEBUG] disable_sim: {disable_sim}, force_sim: {force_sim}")
        sat_data = fetch_satellite_ndvi(
            lat=ndvi_req.latitude,
            lon=ndvi_req.longitude,
            date_str=ndvi_req.date,
            disable_simulation=disable_sim,
            force_simulation=force_sim
        )
        return SatelliteNDVIResponse(
            ndviScore=sat_data["ndviScore"],
            cloudCoverPercent=sat_data["cloudCoverPercent"],
            imageDate=sat_data["imageDate"],
            provider=sat_data["provider"],
            metadata=sat_data.get("metadata", {})
        )
    except ValueError as ve:
        # Fail closed on cloud cover rejection
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        # Fail closed on configuration/API errors
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to AgriTrace AI Service",
        "docs": "/docs",
        "health": "/health"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
