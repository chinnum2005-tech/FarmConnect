import axios from 'axios';
import prisma from '../database/prisma';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || process.env.AI_SERVICE_URL || 'http://localhost:8000';

export const mlService = {
  /**
   * Triggers an async (fire-and-forget) job to fetch the latest NDVI data
   * and assess crop health for a specific field.
   */
  async triggerNdviRefresh(fieldId: string) {
    try {
      console.log(`[ML Service] Triggering async NDVI refresh for field ${fieldId}...`);
      
      // 1. Fetch field, farm, and active crops to determine bounding box criteria
      const field = await prisma.field.findUnique({
        where: { id: fieldId },
        include: {
          farm: true,
          crops: {
            where: {
              growthStage: { notIn: ['HARVESTED'] }
            }
          }
        }
      });

      if (!field || !field.farm) {
        console.error(`[ML Service] Field ${fieldId} or associated farm not found.`);
        return;
      }

      // Sum area of active crops to get the area size in hectares
      let areaHectares = 0;
      if (field.crops && field.crops.length > 0) {
        areaHectares = field.crops.reduce((sum, crop) => sum + (crop.area || 0), 0);
      } else {
        // Fallback to a nominal 1 hectare if no active crops have defined area
        areaHectares = 1.0; 
      }

      const location = field.farm.location as { lat: number, lng: number };
      if (!location || !location.lat || !location.lng) {
         console.error(`[ML Service] Farm for field ${fieldId} is missing lat/lng.`);
         return;
      }

      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const recentReadings = await prisma.nDVIReading.findMany({
        where: {
          fieldId: field.id,
          capturedAt: { gte: sixtyDaysAgo }
        },
        orderBy: { capturedAt: 'asc' },
        select: { ndviScore: true }
      });
      const historicalNdvi = recentReadings.map(r => r.ndviScore);

      // 2. Call the ML Inference Service
      const response = await axios.post(`${ML_SERVICE_URL}/health/ndvi-health`, {
        farmId: field.farm.id,
        lat: location.lat,
        lng: location.lng,
        areaHectares: areaHectares,
        historicalNdvi: historicalNdvi
      });

      const { ndviScore, cloudCoverPct, status, source, satelliteId } = response.data;

      // 3. Save the new NDVI Reading to MongoDB
      await prisma.nDVIReading.create({
        data: {
          fieldId: field.id,
          ndviScore: ndviScore,
          imageSource: source,
          stressFlag: status !== 'HEALTHY',
          provider: satelliteId,
          cloudCoverPercent: cloudCoverPct,
          imageDate: new Date(),
          capturedAt: new Date()
        }
      });
      
      console.log(`[ML Service] Successfully refreshed and saved NDVI for field ${fieldId}`);

    } catch (error: any) {
      console.error(`[ML Service] Failed to complete async NDVI refresh for field ${fieldId}:`, error.message);
    }
  }
};
