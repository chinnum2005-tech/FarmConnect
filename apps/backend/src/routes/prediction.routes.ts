import { Router, Response, NextFunction } from 'express';
import axios from 'axios';
import prisma from '../database/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { computePredictionHash, anchorPrediction } from '../services/provenance.service';
import { fetchLatestPrices } from '../services/agmarknet.service';

const router = Router();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || process.env.AI_SERVICE_URL || 'http://localhost:8000';

/**
 * Get yield prediction for a crop (manual/triggered by farmer)
 */
router.post('/crop/:cropId', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { cropId } = req.params;
    const token = req.headers.authorization || `Bearer ${req.cookies.token}`;

    // Get crop details
    const crop = await prisma.crop.findUnique({
      where: { id: cropId },
      include: { farm: true },
    });

    if (!crop) {
      throw new AppError('Crop not found', 404);
    }

    // Query the latest database values for the crop's field
    const latestWeather = await prisma.weatherSnapshot.findFirst({
      where: { fieldId: crop.fieldId },
      orderBy: { recordedAt: 'desc' }
    });

    const avgTemp = latestWeather?.temperature ?? 25.0;
    const cumRainfall = latestWeather?.rainfall ?? 100.0;

    // NDVI History
    // NDVI History - Only use NDVI captured AFTER planting date (normalized to start of day)
    const plantingDate = crop.plantingDate || new Date();
    const normalizedPlantingDate = new Date(plantingDate);
    normalizedPlantingDate.setUTCHours(0, 0, 0, 0);
    
    const today = new Date();
    
    const recentNdvi = await prisma.nDVIReading.findMany({
      where: {
        fieldId: crop.fieldId,
        capturedAt: { 
          gte: normalizedPlantingDate,
          lte: today
        }
      },
      orderBy: { capturedAt: 'asc' }
    });

    let ndviTrend = 0.15; // Realistic baseline for bare soil / seedling
    let ndviSource = "SIMULATED_BASELINE";
    
    if (recentNdvi.length > 0) {
      ndviTrend = recentNdvi.reduce((sum, r) => sum + r.ndviScore, 0) / recentNdvi.length;
      ndviSource = recentNdvi[recentNdvi.length - 1].imageSource;
    }

    // Days since sowing
    const daysSinceSowing = Math.floor((today.getTime() - plantingDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Debug logging for NDVI tracing
    console.log("=== AI PREDICTION DATA TRACE ===");
    console.log({
        cropId: crop.id,
        plantingDate,
        daysSinceSowing,
        ndviFound: recentNdvi.length > 0 ? recentNdvi[recentNdvi.length - 1].ndviScore : null,
        ndviTrendBeforeValidation: ndviTrend,
        ndviDate: recentNdvi.length > 0 ? recentNdvi[recentNdvi.length - 1].capturedAt : null
    });

    // Biological validation for NDVI
    if (daysSinceSowing <= 5 && ndviTrend > 0.25) {
        console.warn(`Invalid NDVI ${ndviTrend} for ${daysSinceSowing}-day-old crop. Using seedling baseline.`);
        ndviTrend = 0.15;
        ndviSource = "BIOLOGICAL_CLAMP_SEEDLING";
    } else if (daysSinceSowing <= 20 && ndviTrend > 0.50) {
        console.warn(`High NDVI ${ndviTrend} detected during early growth stage. Adjusting.`);
        ndviTrend = 0.30;
        ndviSource = "BIOLOGICAL_CLAMP_EARLY";
    }

    // Call AI service for prediction (forwarding auth token)
    let predictedYieldKg: number;
    let dataQuality = "OBSERVED";
    let modelProvenance = "SYNTHETIC_BOOTSTRAP";
    let confidenceIndicator = "High";
    let confidenceMessage = "In Distribution: Data falls within expected operating range.";

    try {
      const response = await axios.post(
        `${ML_SERVICE_URL}/yield/predict-yield`,
        {
          cropType: crop.type,
          areaHectares: crop.area,
          daysSinceSowing: Math.max(1, daysSinceSowing),
          ndviTrend: ndviTrend,
          avgTemp: avgTemp,
          cumRainfall: cumRainfall,
          ndviSource: ndviSource
        },
        {
          headers: { Authorization: token },
          timeout: 8000
        }
      );
      predictedYieldKg = response.data.predictedYieldKg;
      dataQuality = response.data.dataQuality || dataQuality;
      modelProvenance = response.data.modelProvenance || modelProvenance;
      confidenceIndicator = response.data.confidenceIndicator || confidenceIndicator;
      confidenceMessage = response.data.confidenceMessage || confidenceMessage;
    } catch (aiErr: any) {
      console.warn(`[PredictionRoute] ML service call to ${ML_SERVICE_URL} failed (${aiErr.message}), using agronomic regression engine.`);
      const baselineMap: Record<string, number> = {
        WHEAT: 3800,
        RICE: 4200,
        CORN: 5200,
        SOYBEANS: 2600,
        BARLEY: 3400,
        OATS: 2900,
        CANOLA: 2100,
        SORGHUM: 2400,
        OTHER: 3000
      };
      const basePerHa = baselineMap[crop.type] || 3200;
      predictedYieldKg = Math.round(basePerHa * crop.area * (0.95 + (ndviTrend * 0.1)));
      confidenceIndicator = "Moderate";
      confidenceMessage = "Generated via built-in agronomic regression engine.";
    }

    // Create deterministic input snapshot
    const inputSnapshot = {
      cropType: crop.type,
      area: crop.area,
      daysSinceSowing,
      ndviTrend,
      avgTemp: latestWeather.temperature,
      cumRainfall: latestWeather.rainfall
    };

    const predictionHash = computePredictionHash(inputSnapshot, 'LightGBM-v1', predictedYieldKg);

    // Save prediction to database
    const prediction = await prisma.yieldPrediction.create({
      data: {
        fieldId: crop.fieldId,
        cropType: crop.type,
        predictedYield: predictedYieldKg,
        confidenceInterval: { lower: predictedYieldKg * 0.9, upper: predictedYieldKg * 1.1, score: 0.85 },
        metadata: { 
          dataQuality, 
          modelProvenance,
          confidenceIndicator,
          confidenceMessage
        },
        modelVersion: 'LightGBM-v1',
        predictionHash,
        provenanceStatus: 'PENDING',
        triggeredBy: 'MANUAL'
      },
    });

    // Update the crop's AI predicted yield
    await prisma.crop.update({
      where: { id: crop.id },
      data: { aiPredictedYieldKg: predictedYieldKg }
    });

    // Create ProvenanceRecord audit log
    await prisma.provenanceRecord.create({
      data: {
        predictionId: prediction.id,
        predictionType: 'YIELD',
        inputSnapshot,
        modelVersion: 'LightGBM-v1'
      }
    });

    // Anchor on-chain asynchronously (fail-soft, returning PENDING immediately)
    anchorPrediction(prediction.id, predictionHash, 'YIELD');

    res.json({
      success: true,
      data: {
        prediction,
        message: 'Yield prediction generated and queued for anchoring successfully',
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else if (axios.isAxiosError(error)) {
      next(new AppError('AI service unavailable', 503));
    } else {
      next(new AppError('Failed to generate prediction', 500));
    }
  }
});

/**
 * Get crop recommendation for a field
 */
router.post('/recommend/field/:fieldId', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { fieldId } = req.params;
    const token = req.headers.authorization || `Bearer ${req.cookies.token}`;

    const field = await prisma.field.findUnique({
      where: { id: fieldId }
    });

    if (!field) {
      throw new AppError('Field not found', 404);
    }

    const latestSoil = await prisma.soilReading.findFirst({
      where: { fieldId },
      orderBy: { recordedAt: 'desc' }
    });

    const latestWeather = await prisma.weatherSnapshot.findFirst({
      where: { fieldId },
      orderBy: { recordedAt: 'desc' }
    });

    // Fail-Closed Validation (No Dummy Data)
    if (!latestSoil || !latestWeather) {
      throw new AppError("Cannot recommend crop: no soil or weather data recorded for this field.", 400);
    }

    // Call AI service for crop recommendation (forwarding auth token)
    const response = await axios.post(
      `${ML_SERVICE_URL}/recommend/crop`,
      {
        N: latestSoil.N,
        P: latestSoil.P,
        K: latestSoil.K,
        ph: latestSoil.pH,
        temperature: latestWeather.temperature,
        humidity: latestWeather.humidity,
        rainfall: latestWeather.rainfall
      },
      {
        headers: { Authorization: token }
      }
    );

    const { recommendedCrop, alternatives, confidence, modelVersion, modelProvenance } = response.data;

    // Fetch real-time market price for the recommended crop to estimate ROI
    let currentPricePerQuintal = 2000; // fallback
    try {
      const COMMODITY_MAP: Record<string, string> = {
        rice: 'Paddy(Dhan)(Common)',
        wheat: 'Wheat',
        maize: 'Maize',
        cotton: 'Cotton',
        jute: 'Jute',
        coffee: 'Coffee'
      };
      const agmarknetCommodity = COMMODITY_MAP[recommendedCrop.toLowerCase()] || recommendedCrop;
      const latestRecords = await fetchLatestPrices(agmarknetCommodity, 'Maharashtra'); // Defaulting to Maharashtra
      if (latestRecords && latestRecords.length > 0) {
        const validRecord = latestRecords.find(r => r.modal_price && r.modal_price !== 'NA');
        if (validRecord) {
          currentPricePerQuintal = parseFloat(validRecord.modal_price);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch real-time price for ROI calculation, using fallback.", err);
    }

    // Estimate ROI (assuming 1 hectare yield baseline of 40 quintals for simplicity)
    const expectedRoi = currentPricePerQuintal * 40;

    const inputSnapshot = {
      N: latestSoil.N,
      P: latestSoil.P,
      K: latestSoil.K,
      ph: latestSoil.pH,
      temperature: latestWeather.temperature,
      humidity: latestWeather.humidity,
      rainfall: latestWeather.rainfall
    };

    const predictionHash = computePredictionHash(inputSnapshot, modelVersion, recommendedCrop);

    // Save crop recommendation
    const recommendation = await prisma.cropRecommendation.create({
      data: {
        fieldId,
        inputSnapshot,
        recommendedCrop,
        alternatives,
        confidence,
        modelVersion,
        predictionHash,
        metadata: {
          modelProvenance,
          expectedRoi,
          roiBasis: "current_market_price",
          pricePerQuintal: currentPricePerQuintal
        },
        provenanceStatus: 'PENDING'
      }
    });

    // Create ProvenanceRecord audit log
    await prisma.provenanceRecord.create({
      data: {
        predictionId: recommendation.id,
        predictionType: 'CROP',
        inputSnapshot,
        modelVersion
      }
    });

    // Anchor on-chain asynchronously (fail-soft)
    anchorPrediction(recommendation.id, predictionHash, 'CROP');

    res.json({
      success: true,
      data: {
        recommendation,
        message: 'Crop recommendation generated and queued for anchoring successfully'
      }
    });

  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else if (axios.isAxiosError(error)) {
      next(new AppError('AI service unavailable', 503));
    } else {
      next(new AppError('Failed to generate recommendation', 500));
    }
  }
});

export default router;
