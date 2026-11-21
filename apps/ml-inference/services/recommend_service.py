import os
import joblib
import pandas as pd
import numpy as np

OUTPUT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(OUTPUT_DIR, "models", "crop_rec_model.pkl")
ENCODER_PATH = os.path.join(OUTPUT_DIR, "models", "crop_label_encoder.pkl")

_model = None
_encoder = None
_crop_advisor_fallback = None

def get_fallback_crop_advisor():
    global _crop_advisor_fallback
    if _crop_advisor_fallback is None:
        import sys
        ai_service_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "services", "ai-service"))
        if ai_service_dir not in sys.path:
            sys.path.insert(0, ai_service_dir)
        from models.crop_advisor import CropAdvisor
        _crop_advisor_fallback = CropAdvisor()
    return _crop_advisor_fallback

def get_model():
    global _model, _encoder
    if _model is None or _encoder is None:
        if not os.path.exists(MODEL_PATH) or not os.path.exists(ENCODER_PATH):
            _model = False
            _encoder = False
            return None, None
        try:
            _model = joblib.load(MODEL_PATH)
            _encoder = joblib.load(ENCODER_PATH)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Could not load XGBoost model: {e}")
            _model = False
            _encoder = False
    return (_model, _encoder) if (_model is not False and _encoder is not False) else (None, None)

def predict_crop(n: float, p: float, k: float, temp: float, humidity: float, ph: float, rainfall: float):
    model, encoder = get_model()
    if model is not None and encoder is not None:
        try:
            # Feature order must match Kaggle dataset: N, P, K, temperature, humidity, ph, rainfall
            input_df = pd.DataFrame([{
                'N': n,
                'P': p,
                'K': k,
                'temperature': temp,
                'humidity': humidity,
                'ph': ph,
                'rainfall': rainfall
            }])
            
            # Predict probabilities for top crops
            probs = model.predict_proba(input_df)[0]
            
            # Get top 3 indices
            top_3_idx = np.argsort(probs)[::-1][:3]
            
            # Decode labels
            top_3_crops = encoder.inverse_transform(top_3_idx)
            top_3_probs = probs[top_3_idx]
            
            recommended_crop = top_3_crops[0].upper()
            confidence = float(top_3_probs[0])
            
            alternatives = [
                {"crop": top_3_crops[1].upper(), "confidence": float(top_3_probs[1])},
                {"crop": top_3_crops[2].upper(), "confidence": float(top_3_probs[2])}
            ]
            return recommended_crop, alternatives, confidence
        except Exception as exc:
            pass
        
        return recommended_crop, alternatives, confidence
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(f"XGBoost crop model unavailable ({exc}). Using CropAdvisor fallback.")
        ca = get_fallback_crop_advisor()
        res = ca.recommend(n, p, k, temp, humidity, ph, rainfall)
        recommended_crop = res.get('recommendedCrop', 'RICE').upper()
        recs = res.get('alternativeRecommendations', [])
        confidence = float(recs[0]['confidence']) if recs else 0.85
        alt1 = recs[1]['crop'].upper() if len(recs) > 1 else "MAIZE"
        conf1 = float(recs[1]['confidence']) if len(recs) > 1 else 0.15
        alt2 = recs[2]['crop'].upper() if len(recs) > 2 else "COTTON"
        conf2 = float(recs[2]['confidence']) if len(recs) > 2 else 0.10
        alternatives = [
            {"crop": alt1, "confidence": conf1},
            {"crop": alt2, "confidence": conf2}
        ]
        return recommended_crop, alternatives, confidence
