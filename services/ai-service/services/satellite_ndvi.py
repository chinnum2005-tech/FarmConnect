import os
import random
import hashlib
import json
import time
from datetime import datetime, timedelta

# Lazy import ee to prevent import crashes if library is not configured
ee = None

def init_earth_engine() -> bool:
    global ee
    if ee is not None:
        return True
    try:
        import ee as ee_module
        project_id = os.getenv("EARTH_ENGINE_PROJECT_ID")
        if not project_id:
            return False
        ee_module.Initialize(project=project_id)
        ee = ee_module
        print(f"[GEE] Earth Engine initialized successfully with project '{project_id}'", flush=True)
        return True
    except Exception as e:
        print(f"[GEE WARNING] Earth Engine initialization failed: {e}. If running locally, make sure you ran 'earthengine authenticate'.", flush=True)
        return False

# Attempt initial load
init_earth_engine()

def fetch_satellite_ndvi(lat: float, lon: float, date_str: str, disable_simulation: bool = False, force_simulation: bool = False) -> dict:
    """
    Fetch Sentinel-2 L2A NDVI from Google Earth Engine (GEE).
    Includes cloud filtering (<20%) and fail-closed cropland vegetation check (<0.08).
    """
    simulation_mode = os.getenv("NDVI_SIMULATION_MODE") == "true" or force_simulation
    project_id = os.getenv("EARTH_ENGINE_PROJECT_ID")
    
    if not simulation_mode:
        if not disable_simulation:
            if not project_id or not init_earth_engine():
                print("[GEE NOTE] GEE not fully configured for local development. Operating in calibrated simulation mode.", flush=True)
                simulation_mode = True
        else:
            if not project_id:
                raise RuntimeError("Google Earth Engine project ID not configured. Please set EARTH_ENGINE_PROJECT_ID in your environment.")
            initialized = init_earth_engine()
            if not initialized:
                raise RuntimeError("Failed to initialize Google Earth Engine. Please check your credentials and project ID.")

    if simulation_mode:
        # Seed generator deterministically based on coordinates and date
        seed_str = f"{lat:.4f}:{lon:.4f}:{date_str}"
        h = hashlib.md5(seed_str.encode('utf-8')).hexdigest()
        random.seed(int(h[:8], 16))
        
        # Simulate cloud cover percent (0% to 100%)
        cloud_cover = random.uniform(0.0, 100.0)
        
        # FAIL CLOSED: Cloud cover check
        if cloud_cover > 20.0:
            raise ValueError(f"no clear satellite image available due to {cloud_cover:.1f}% cloud cover")
            
        red_band = random.uniform(0.05, 0.25)
        nir_band = random.uniform(0.40, 0.85)
        ndvi_score = (nir_band - red_band) / (nir_band + red_band)
        
        # FAIL CLOSED: Cropland validation check
        if ndvi_score < 0.08:
            raise ValueError("unable to resolve a vegetation signal for these coordinates — location may not be cropland")
            
        return {
            "ndviScore": round(ndvi_score, 4),
            "cloudCoverPercent": round(cloud_cover, 2),
            "imageDate": date_str,
            "provider": "simulated",
            "metadata": {
                "redBand": round(red_band, 4),
                "nirBand": round(nir_band, 4),
                "simulatedSource": "GEE Sentinel-2 L2A"
            }
        }
        
    # Real GEE execution
    try:
        point = ee.Geometry.Point([lon, lat])
        target_date = datetime.strptime(date_str, "%Y-%m-%d")
        start_date = (target_date - timedelta(days=10)).strftime("%Y-%m-%d")
        end_date = (target_date + timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Query Sentinel-2 surface reflectance harmonized
        collection = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(point)
            .filterDate(start_date, end_date)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
            .sort("CLOUDY_PIXEL_PERCENTAGE")
        )
        
        if collection.size().getInfo() == 0:
            collection = (
                ee.ImageCollection("COPERNICUS/S2_HARMONIZED")
                .filterBounds(point)
                .filterDate(start_date, end_date)
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
                .sort("CLOUDY_PIXEL_PERCENTAGE")
            )
            
        if collection.size().getInfo() == 0:
            raise ValueError("No Sentinel-2 imagery available for the specified date and location")
            
        image = collection.first()
            
        cloud_cover = float(image.get("CLOUDY_PIXEL_PERCENTAGE").getInfo())
        time_start = image.get("system:time_start").getInfo()
        actual_date = datetime.utcfromtimestamp(time_start / 1000.0).strftime("%Y-%m-%d")
        
        # Calculate NDVI server-side: B8 (NIR) and B4 (Red)
        ndvi_image = image.normalizedDifference(["B8", "B4"])
        
        # Reduce 100m region around coordinate
        region = point.buffer(100)
        mean_ndvi = ndvi_image.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=region,
            scale=10,
            maxPixels=1e6
        ).get("nd").getInfo()
        
        if mean_ndvi is None:
            raise ValueError("Satellite image contains no valid pixels for NDVI calculation")
            
        ndvi_score = float(mean_ndvi)
        
        # FAIL CLOSED: Cropland validation check (NDVI < 0.08)
        if ndvi_score < 0.08:
            raise ValueError("unable to resolve a vegetation signal for these coordinates — location may not be cropland")
            
        return {
            "ndviScore": round(ndvi_score, 4),
            "cloudCoverPercent": round(cloud_cover, 2),
            "imageDate": actual_date,
            "provider": "google-earth-engine",
            "metadata": {
                "sensor": "Sentinel-2 MSI Harmonized",
                "cloudFiltered": True,
                "resolution": "10m"
            }
        }
    except Exception as e:
        if isinstance(e, ValueError):
            raise e
        raise RuntimeError(f"Google Earth Engine query failed: {str(e)}")
