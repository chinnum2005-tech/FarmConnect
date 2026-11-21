from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from services.recommend_service import predict_crop

router = APIRouter(prefix="/recommend", tags=["Crop Recommendation"])

class CropPredictionRequest(BaseModel):
    N: float
    P: float
    K: float
    ph: float
    temperature: float
    humidity: float
    rainfall: float

class AlternativeCrop(BaseModel):
    crop: str
    confidence: float

class CropPredictionResponse(BaseModel):
    recommendedCrop: str
    alternatives: List[AlternativeCrop]
    confidence: float
    modelVersion: str
    modelProvenance: str

@router.post("/crop", response_model=CropPredictionResponse)
def get_crop_recommendation(req: CropPredictionRequest):
    try:
        recommended_crop, alternatives, confidence = predict_crop(
            n=req.N,
            p=req.P,
            k=req.K,
            temp=req.temperature,
            humidity=req.humidity,
            ph=req.ph,
            rainfall=req.rainfall
        )
        
        return CropPredictionResponse(
            recommendedCrop=recommended_crop,
            alternatives=alternatives,
            confidence=confidence,
            modelVersion="XGBoost-Kaggle-v1",
            modelProvenance="PUBLIC_DATASET_COLD_START"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
