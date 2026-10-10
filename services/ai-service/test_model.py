"""
Test script for verifying retained AI service models:
- YieldPredictor
- CropAdvisor
- FertilizerAdvisor
Ensures all retained inference features function properly without any disease detection dependencies.
"""
import sys
import io

# Ensure UTF-8 output encoding across Windows consoles
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from datetime import datetime
from models.yield_predictor import YieldPredictor
from models.crop_advisor import CropAdvisor
from models.fertilizer_advisor import FertilizerAdvisor

def test_retained_models():
    print("=== Testing Retained AI Models ===")
    
    # 1. Yield Predictor
    print("1. Initializing YieldPredictor...")
    yield_predictor = YieldPredictor()
    yield_result = yield_predictor.predict(
        crop_type="WHEAT",
        area=2.5,
        planting_date=datetime.now(),
        weather={"temperature": 22.0, "rainfall": 120.0, "humidity": 55.0},
        soil={"ph_level": 6.8, "nitrogen": 60.0, "phosphorus": 35.0, "potassium": 45.0}
    )
    print(f"   [PASS] Yield Prediction: {yield_result['yield']} kg (Confidence: {yield_result['confidence']})")
    assert "yield" in yield_result
    assert yield_result["yield"] > 0
    
    # 2. Crop Advisor
    print("2. Initializing CropAdvisor...")
    crop_advisor = CropAdvisor()
    crop_result = crop_advisor.recommend(
        n=80.0,
        p=40.0,
        k=40.0,
        temp=26.0,
        humidity=70.0,
        ph=6.5,
        rainfall=200.0
    )
    print(f"   [PASS] Recommended Crop: {crop_result['recommendedCrop']}")
    assert "recommendedCrop" in crop_result
    assert len(crop_result["recommendedCrop"]) > 0
    
    # 3. Fertilizer Advisor
    print("3. Initializing FertilizerAdvisor...")
    fertilizer_advisor = FertilizerAdvisor()
    fertilizer_result = fertilizer_advisor.recommend(
        temp=26.0,
        humidity=52.0,
        moisture=38.0,
        soil_type="Clayey",
        crop_type="Wheat",
        n=37.0,
        k=0.0,
        p=0.0
    )
    print(f"   [PASS] Recommended Fertilizer: {fertilizer_result['recommendedFertilizer']}")
    assert "recommendedFertilizer" in fertilizer_result
    
    print("\n=== ALL RETAINED AI MODELS VERIFIED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_retained_models()
