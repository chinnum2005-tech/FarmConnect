import { Response } from 'express';
import prisma from '../database/prisma';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { CreateCropInput, UpdateCropStageInput } from '../validators/schemas';

// Get all crops (admin only)
export const getAllCrops = async (req: AuthRequest, res: Response) => {
  try {
    const crops = await prisma.crop.findMany({
      include: { 
        farm: {
          select: {
            id: true,
            name: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
              }
            }
          }
        },
        predictions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        }
      },
    });
    
    res.json({ 
      success: true, 
      data: crops,
      count: crops.length
    });
  } catch (error) {
    throw new AppError('Failed to fetch crops', 500);
  }
};

// Get farmer's crops
export const getMyCrops = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      throw new AppError('User ID not found', 401);
    }

    // Get farmer's farm
    const farm = await prisma.farm.findUnique({ 
      where: { userId: req.user.id },
      select: { id: true }
    });
    
    if (!farm) {
      throw new AppError('No farm found for this user. Please register a farm first.', 404);
    }

    const crops = await prisma.crop.findMany({
      where: { farmId: farm.id },
      include: { 
        predictions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        }
      },
    });

    res.json({ success: true, data: crops });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch crops', 500);
  }
};

// Create crop (farmer only)
export const createCrop = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      throw new AppError('User ID not found', 401);
    }

    // Crop-Specific Minimum Growing Period (Days)
    const { name, type, variety, plantingDate, expectedHarvest, area } = req.body;
    const minDaysMap: Record<string, number> = {
      WHEAT: 90,
      RICE: 90,
      CORN: 60,
      SOYBEANS: 75,
      BARLEY: 60,
      OATS: 60,
      CANOLA: 80,
      SORGHUM: 90,
      OTHER: 20
    };
    
    // Harvest Date Validation
    if (expectedHarvest && new Date(expectedHarvest) <= new Date(plantingDate)) {
      throw new AppError('Expected harvest date must be after the planting date', 400);
    }
    const daysBetween = expectedHarvest ? (new Date(expectedHarvest).getTime() - new Date(plantingDate).getTime()) / (1000 * 60 * 60 * 24) : null;
    const minDays = minDaysMap[type] || 20;
    
    if (daysBetween !== null && daysBetween < minDays) {
      throw new AppError(`Unrealistic harvest date: ${type} requires a minimum growing period of ${minDays} days.`, 400);
    }

    // Area is now expected to be in Hectares natively

    // Get farmer's farm
    const farm = await prisma.farm.findUnique({ 
      where: { userId: req.user.id },
      select: { id: true, size: true }
    });
    
    if (!farm) {
      throw new AppError('No farm found for this user. Please register a farm first.', 404);
    }

    // Capacity Validation
    const activeCrops = await prisma.crop.findMany({
      where: {
        farmId: farm.id,
        growthStage: {
          not: 'HARVESTED'
        }
      },
      select: { area: true }
    });

    const currentUsedAreaHectares = activeCrops.reduce((acc, c) => acc + c.area, 0);
    if (currentUsedAreaHectares + area > farm.size) {
      const remainingHectares = (farm.size - currentUsedAreaHectares).toFixed(2);
      throw new AppError(`Insufficient land area. You only have ${remainingHectares > "0" ? remainingHectares : "0"} hectares available on your farm.`, 400);
    }

    let field = await prisma.field.findFirst({
      where: { farmId: farm.id },
      orderBy: { createdAt: 'asc' }
    });

    if (!field) {
      // Auto-provision default field for seamless crop creation
      field = await prisma.field.create({
        data: {
          name: 'Main Field',
          farmId: farm.id,
          polygon: { type: 'Point', coordinates: [0, 0] },
        }
      });
    }

    const { estimatedYield } = req.body;

    const crop = await prisma.crop.create({
      data: {
        name,
        type,
        variety,
        plantingDate,
        expectedHarvest,
        area: Number(area),
        farmId: farm.id,
        fieldId: field.id,
        estimatedYield: estimatedYield ? Number(estimatedYield) : undefined,
      },
    });

    res.status(201).json({ 
      success: true, 
      data: crop,
      message: 'Crop created successfully'
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to create crop', 500);
  }
};

// Update crop growth stage
export const updateCropStage = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      throw new AppError('User ID not found', 401);
    }

    const { id } = req.params;
    const { growthStage, version } = req.body;

    const crop = await prisma.crop.findUnique({ 
      where: { id },
      include: { farm: true }
    });
    
    if (!crop) {
      throw new AppError('Crop not found', 404);
    }

    // Verify ownership
    if (crop.farm.userId !== req.user.id) {
      throw new AppError('Unauthorized to update this crop', 403);
    }

    // Optimistic locking check
    if (version !== undefined && crop.version !== version) {
      throw new AppError('Conflict detected. Crop has been modified by another transaction. Please refresh and try again.', 409, crop);
    }

    const updatedCrop = await prisma.crop.update({
      where: { id },
      data: { 
        growthStage,
        version: { increment: 1 } 
      },
    });

    res.json({ 
      success: true, 
      data: updatedCrop,
      message: `Crop stage updated to ${growthStage}`
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to update crop stage', 500);
  }
};

// Update crop estimated yield
export const updateCropEstimate = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      throw new AppError('User ID not found', 401);
    }

    const { id } = req.params;
    const { estimatedYield } = req.body;

    const crop = await prisma.crop.findUnique({ 
      where: { id },
      include: { farm: true }
    });
    
    if (!crop) {
      throw new AppError('Crop not found', 404);
    }

    if (crop.farm.userId !== req.user.id) {
      throw new AppError('Unauthorized to update this crop', 403);
    }

    const updatedCrop = await prisma.crop.update({
      where: { id },
      data: { estimatedYield },
    });

    res.json({ 
      success: true, 
      data: updatedCrop,
      message: `Crop estimated yield updated`
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to update crop estimate', 500);
  }
};

// Update crop details
export const updateCrop = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      throw new AppError('User ID not found', 401);
    }

    const { id } = req.params;
    const updateData = req.body;

    const crop = await prisma.crop.findUnique({ 
      where: { id },
      include: { 
        farm: true,
        predictions: { take: 1 } 
      }
    });
    
    if (!crop) {
      throw new AppError('Crop not found', 404);
    }

    if (crop.farm.userId !== req.user.id) {
      throw new AppError('Unauthorized to update this crop', 403);
    }

    if (crop.predictions && crop.predictions.length > 0) {
      throw new AppError('Cannot edit crop: A yield prediction is already anchored on the blockchain for this crop.', 403);
    }

    // Harvest Date Validation for Updates
    const newPlantingDate = updateData.plantingDate ? new Date(updateData.plantingDate) : crop.plantingDate;
    const newHarvestDate = updateData.expectedHarvest ? new Date(updateData.expectedHarvest) : crop.expectedHarvest;
    
    // Crop-Specific Minimum Growing Period (Days)
    const minDaysMap: Record<string, number> = {
      WHEAT: 90,
      RICE: 90,
      CORN: 60,
      SOYBEANS: 75,
      BARLEY: 60,
      OATS: 60,
      CANOLA: 80,
      SORGHUM: 90,
      OTHER: 20
    };
    
    if (newHarvestDate && newHarvestDate <= newPlantingDate) {
      throw new AppError('Expected harvest date must be after the planting date', 400);
    }
    const daysBetween = newHarvestDate ? (newHarvestDate.getTime() - newPlantingDate.getTime()) / (1000 * 60 * 60 * 24) : null;
    const currentType = updateData.type || crop.type;
    const minDays = minDaysMap[currentType] || 20;

    if (daysBetween !== null && daysBetween < minDays) {
      throw new AppError(`Unrealistic harvest date: ${currentType} requires a minimum growing period of ${minDays} days.`, 400);
    }

    // Area is now expected to be in Hectares natively

    const updatedCrop = await prisma.crop.update({
      where: { id },
      data: updateData,
    });

    res.json({ 
      success: true, 
      data: updatedCrop,
      message: `Crop updated successfully`
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to update crop details', 500);
  }
};
