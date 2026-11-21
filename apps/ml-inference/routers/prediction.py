from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.yield_service import predict_yield

router = APIRouter(prefix="/yield", tags=["Yield Prediction"])

class YieldPredictionRequest(BaseModel):
    cropType: str
    areaHectares: float
    daysSinceSowing: int
    ndviTrend: float
    avgTemp: float
    cumRainfall: float
    ndviSource: str # e.g. "SIMULATED_MOCK" or "SENTINEL_2"

class YieldPredictionResponse(BaseModel):
    predictedYieldKg: float
    dataQuality: str
    modelProvenance: str
    confidenceIndicator: str
    confidenceMessage: str

@router.post("/predict-yield", response_model=YieldPredictionResponse)
def get_yield_prediction(req: YieldPredictionRequest):
    try:
        # Predict using LightGBM model
        pred_result = predict_yield(
            crop_type=req.cropType,
            area_hectares=req.areaHectares,
            days_since_sowing=req.daysSinceSowing,
            ndvi_trend=req.ndviTrend,
            avg_temp=req.avgTemp,
            cum_rainfall=req.cumRainfall
        )
        
        # Determine Data Quality
        # If the input NDVI was simulated, the whole prediction data quality is simulated
        if req.ndviSource == "SIMULATED_MOCK" or req.ndviSource == "SIMULATED_BASELINE":
            data_quality = "SIMULATED"
        else:
            data_quality = "OBSERVED"
            
        # Determine Model Provenance
        # This explicit flag ensures that even OBSERVED data correctly states the model is bootstrapped.
        model_provenance = "SYNTHETIC_BOOTSTRAP"
            
        return YieldPredictionResponse(
            predictedYieldKg=pred_result["predicted_yield_kg"],
            dataQuality=data_quality,
            modelProvenance=model_provenance,
            confidenceIndicator=pred_result["confidence"],
            confidenceMessage=pred_result["message"]
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
