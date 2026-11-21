import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.preprocessing import LabelEncoder
import joblib
import os
import csv

class FertilizerAdvisor:
    """
    Fertilizer Recommendation Advisor using scikit-learn
    Trained on Fertilizer Prediction.csv (99 rows, 7 fertilizer types).
    Uses 5-fold Stratified Cross-Validation.
    """
    
    def __init__(self):
        self.classifier = RandomForestClassifier(n_estimators=100, random_state=42)
        self.soil_encoder = LabelEncoder()
        self.crop_encoder = LabelEncoder()
        self.fertilizer_encoder = LabelEncoder()
        self.is_trained = False
        self.model_dir = os.path.join(os.path.dirname(__file__), "..", "data")
        
        # Load or train model
        self._load_or_train()

    def _load_or_train(self):
        model_path = os.path.join(self.model_dir, "fertilizer_advisor.joblib")
        encoders_path = os.path.join(self.model_dir, "fertilizer_advisor_encoders.joblib")
        
        if os.path.exists(model_path) and os.path.exists(encoders_path):
            try:
                self.load_model(self.model_dir)
                return
            except Exception as e:
                print(f"[MODEL TRAINING] Error loading fertilizer advisor model: {e}. Retraining...")
                
        self._train_model()
        self.save_model(self.model_dir)

    def _train_model(self):
        dataset_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "..",
            "Dataset",
            "Fertilizer Prediction.csv"
        )
        
        if not os.path.exists(dataset_path):
            raise FileNotFoundError(f"Missing fertilizer dataset at {dataset_path}")
            
        raw_rows = []
        soil_types = []
        crop_types = []
        y = []
        
        with open(dataset_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            headers = next(reader)
            # Temparature, Humidity, Moisture, Soil Type, Crop Type, Nitrogen, Potassium, Phosphorous, Fertilizer Name
            for row in reader:
                raw_rows.append(row)
                soil_types.append(row[3])
                crop_types.append(row[4])
                y.append(row[-1])
                
        # Fit Label Encoders
        self.soil_encoder.fit(soil_types)
        self.crop_encoder.fit(crop_types)
        y_encoded = self.fertilizer_encoder.fit_transform(y)
        
        X = []
        for row in raw_rows:
            soil_code = self.soil_encoder.transform([row[3]])[0]
            crop_code = self.crop_encoder.transform([row[4]])[0]
            features = [
                float(row[0]),  # Temp
                float(row[1]),  # Humidity
                float(row[2]),  # Moisture
                soil_code,
                crop_code,
                float(row[5]),  # N
                float(row[6]),  # K
                float(row[7])   # P
            ]
            X.append(features)
            
        X = np.array(X)
        
        # 5-fold Stratified Cross-Validation on the 99-row dataset
        print("[MODEL TRAINING WARNING] Fertilizer Prediction dataset is small (99 rows). Running 5-Fold Stratified Cross-Validation...", flush=True)
        skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        scores = cross_val_score(self.classifier, X, y_encoded, cv=skf)
        
        print(f"[MODEL TRAINING] Fertilizer CV Accuracies: {[f'{s:.4f}' for s in scores]}", flush=True)
        print(f"[MODEL TRAINING] Fertilizer Mean CV Accuracy: {scores.mean():.4f} (Var: {scores.var():.6f})", flush=True)
        
        # Train on full dataset
        self.classifier.fit(X, y_encoded)
        self.is_trained = True

    def _normalize_soil(self, soil: str) -> str:
        s = (soil or "").strip().lower()
        mapping = {
            'black': 'Black', 'clay': 'Clayey', 'clayey': 'Clayey',
            'loam': 'Loamy', 'loamy': 'Loamy', 'red': 'Red',
            'sand': 'Sandy', 'sandy': 'Sandy'
        }
        return mapping.get(s, 'Loamy')

    def _normalize_crop(self, crop: str) -> str:
        c = (crop or "").strip().lower()
        mapping = {
            'rice': 'Paddy', 'paddy': 'Paddy',
            'wheat': 'Wheat',
            'barley': 'Barley',
            'maize': 'Maize', 'corn': 'Maize',
            'cotton': 'Cotton',
            'ground nut': 'Ground Nuts', 'ground nuts': 'Ground Nuts', 'groundnut': 'Ground Nuts', 'peanut': 'Ground Nuts',
            'millets': 'Millets', 'millet': 'Millets', 'sorghum': 'Millets', 'ragi': 'Millets', 'bajra': 'Millets',
            'oil seeds': 'Oil seeds', 'oilseeds': 'Oil seeds', 'mustard': 'Oil seeds', 'soybean': 'Oil seeds', 'soyabean': 'Oil seeds',
            'pulses': 'Pulses', 'pulse': 'Pulses', 'pigeonpea': 'Pulses', 'pigeonpeas': 'Pulses', 'chickpea': 'Pulses',
            'sugarcane': 'Sugarcane',
            'tobacco': 'Tobacco'
        }
        if c in mapping:
            return mapping[c]
        # Partial match
        for key, val in mapping.items():
            if key in c:
                return val
        return 'Wheat'

    def recommend(self, temp: float, humidity: float, moisture: float, soil_type: str, crop_type: str, n: float, k: float, p: float) -> dict:
        if not self.is_trained:
            raise Exception("Fertilizer Advisor model not trained")
            
        # Encode categorical inputs with robust normalization
        norm_soil = self._normalize_soil(soil_type)
        try:
            soil_code = self.soil_encoder.transform([norm_soil])[0]
        except Exception:
            soil_code = self.soil_encoder.transform(['Loamy'])[0]
            
        norm_crop = self._normalize_crop(crop_type)
        try:
            crop_code = self.crop_encoder.transform([norm_crop])[0]
        except Exception:
            crop_code = self.crop_encoder.transform(['Wheat'])[0]
            
        features = np.array([[temp, humidity, moisture, soil_code, crop_code, n, k, p]])
        pred_encoded = self.classifier.predict(features)[0]
        pred_fertilizer = self.fertilizer_encoder.inverse_transform([pred_encoded])[0]
        
        # Probabilities
        probs = self.classifier.predict_proba(features)[0]
        top_indices = np.argsort(probs)[::-1][:2]
        
        alternatives = []
        for idx in top_indices:
            fert_name = self.fertilizer_encoder.inverse_transform([idx])[0]
            confidence = float(probs[idx])
            if confidence > 0.01:
                alternatives.append({
                    "fertilizer": fert_name,
                    "confidence": confidence
                })
                
        return {
            "recommendedFertilizer": pred_fertilizer,
            "alternativeRecommendations": alternatives,
            "dataSource": "fertilizer-prediction-kaggle-99",
            "warning": "Model trained on a small dataset (99 records). Use results as a baseline."
        }

    def save_model(self, path: str):
        os.makedirs(path, exist_ok=True)
        joblib.dump(self.classifier, os.path.join(path, "fertilizer_advisor.joblib"))
        encoders = {
            "soil": self.soil_encoder,
            "crop": self.crop_encoder,
            "fertilizer": self.fertilizer_encoder
        }
        joblib.dump(encoders, os.path.join(path, "fertilizer_advisor_encoders.joblib"))
        print(f"Fertilizer Advisor model saved to {path}")

    def load_model(self, path: str):
        self.classifier = joblib.load(os.path.join(path, "fertilizer_advisor.joblib"))
        encoders = joblib.load(os.path.join(path, "fertilizer_advisor_encoders.joblib"))
        self.soil_encoder = encoders["soil"]
        self.crop_encoder = encoders["crop"]
        self.fertilizer_encoder = encoders["fertilizer"]
        self.is_trained = True
        print(f"Fertilizer Advisor model loaded from {path}")
