import { Response } from 'express';
import QRCode from 'qrcode';
import prisma from '../database/prisma';
import { AppError } from '../middleware/errorHandler';
import crypto from 'crypto';
import { blockchainService, RegistryEventType, toRegistryEventType } from '../services/blockchain.service';
import { hashEvidence, toBatchIdBytes32 } from '../services/evidenceHasher';

// Verify product by QR code (public endpoint)
export const verifyProduct = async (req: any, res: Response) => {
  try {
    const { qrCode } = req.params;

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(qrCode);
    
    // 1. First, try to find a Product directly
    let product = null;
    let crop = null;

    if (isObjectId) {
      product = await prisma.product.findUnique({
        where: { id: qrCode },
        include: { crop: true }
      });
    }

    // 2. If no product found, look for Crop by id or qrCode
    if (product) {
      crop = product.crop;
    } else {
      crop = await prisma.crop.findFirst({
        where: {
          OR: [
            { qrCode },
            ...(isObjectId ? [{ id: qrCode }] : [])
          ]
        },
      });
    }

    if (!crop) {
      throw new AppError('Product not found or invalid QR code', 404);
    }

    // Reload crop with all necessary relations
    const fullCrop = await prisma.crop.findUnique({
      where: { id: crop.id },
      include: {
        farm: {
          include: { 
            user: {
              select: {
                firstName: true,
                lastName: true,
              }
            }
          },
        },
        predictions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!fullCrop) {
      throw new AppError('Crop not found', 404);
    }

    // 3. Fetch all Supply Chain Events related to either the Crop OR its Products
    const productsForCrop = await prisma.product.findMany({ where: { cropId: crop.id }, select: { id: true } });
    const productIds = productsForCrop.map(p => p.id);

    const supplyChainEvents = await prisma.supplyChainEvent.findMany({
      where: {
        OR: [
          { cropId: crop.id },
          { productId: { in: productIds } }
        ]
      },
      include: { 
        actor: {
          select: {
            firstName: true,
            lastName: true,
            role: true,
          }
        }
      },
      orderBy: { timestamp: 'asc' },
    });

    res.json({
      success: true,
      data: {
        crop: {
          id: fullCrop.id,
          name: fullCrop.name,
          type: fullCrop.type,
          variety: fullCrop.variety,
          plantingDate: fullCrop.plantingDate,
          growthStage: fullCrop.growthStage,
          estimatedYield: fullCrop.estimatedYield,
          actualYield: fullCrop.actualYield,
        },
        farm: {
          name: fullCrop.farm.name,
          location: fullCrop.farm.location,
          size: fullCrop.farm.size,
          certification: fullCrop.farm.certification,
          farmer: {
            firstName: fullCrop.farm.user.firstName,
            lastName: fullCrop.farm.user.lastName,
          },
        },
        predictions: fullCrop.predictions[0] || null,
        supplyChainEvents: supplyChainEvents.map(evt => {
          let metadataObj = null;
          try {
            if (evt.metadata) metadataObj = JSON.parse(evt.metadata);
          } catch (e) {}
          
          return {
            id: evt.id,
            eventType: evt.eventType,
            title: evt.eventType.replace('_', ' '),
            description: metadataObj?.description || '',
            location: evt.location || 'Unknown',
            timestamp: evt.timestamp,
            date: evt.timestamp,
            actor: evt.actor ? `${evt.actor.firstName} ${evt.actor.lastName}` : 'System',
            actorRole: evt.actor ? evt.actor.role : 'System',
            verified: evt.verified,
            chainStatus: evt.chainStatus,
            transactionHash: evt.transactionHash,
            blockNumber: evt.blockNumber,
            metadata: metadataObj,
          };
        }),
      },
      message: 'Product verified successfully',
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to verify product', 500);
  }
};

// Generate QR code for a crop
export const generateQRCode = async (req: any, res: Response) => {
  try {
    const { cropId } = req.params;

    const crop = await prisma.crop.findUnique({ 
      where: { id: cropId },
      include: { farm: true }
    });
    
    if (!crop) {
      throw new AppError('Crop not found', 404);
    }

    // Generate unique, unpredictable QR code data (MED-002)
    const qrData = crypto.randomBytes(16).toString('hex');

    // Generate QR code image as base64
    const qrCodeImage = await QRCode.toDataURL(qrData);

    // Update crop with QR code
    await prisma.crop.update({
      where: { id: cropId },
      data: { qrCode: qrData },
    });

    res.json({
      success: true,
      data: {
        qrCode: qrData,
        qrCodeImage,
        cropId: crop.id,
        cropName: crop.name,
      },
      message: 'QR code generated successfully',
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to generate QR code', 500);
  }
};

/**
 * Independent on-chain produce verification endpoint.
 * Reads on-chain commitments directly from AgroTraceRegistry via read-only RPC provider,
 * recomputes the cryptographic evidence hash from off-chain produce data,
 * and distinguishes VERIFIED, MISMATCH, NOT_FOUND, PENDING, and UNAVAILABLE states.
 */
export const verifyOnChainProduce = async (req: any, res: Response) => {
  try {
    const { identifier } = req.params;
    if (!identifier) {
      throw new AppError('Batch or produce identifier is required', 400);
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);

    // 1. Locate product or crop
    let product: any = null;
    let crop: any = null;

    if (isObjectId) {
      product = await prisma.product.findUnique({
        where: { id: identifier },
        include: { crop: { include: { farm: true } } },
      });
    }

    if (product) {
      crop = product.crop;
    } else {
      crop = await prisma.crop.findFirst({
        where: {
          OR: [
            { qrCode: identifier },
            ...(isObjectId ? [{ id: identifier }] : []),
          ],
        },
        include: { farm: true },
      });
    }

    if (!crop && !product) {
      // Check if identifier is a direct batchId
      let customEvidence: any = { id: identifier };
      if (req.body?.evidence) {
        customEvidence = req.body.evidence;
      } else if (req.query?.evidence) {
        try {
          customEvidence = typeof req.query.evidence === 'string' ? JSON.parse(req.query.evidence) : req.query.evidence;
        } catch (e) {
          customEvidence = { raw: req.query.evidence };
        }
      }

      const eventTypeParam = req.query?.eventType !== undefined
        ? toRegistryEventType(req.query.eventType as string)
        : (req.body?.eventType !== undefined ? toRegistryEventType(req.body.eventType) : RegistryEventType.PLANTED);

      const batchResult = await blockchainService.verifyOnChain(identifier, eventTypeParam, customEvidence);
      return res.json({
        success: true,
        data: batchResult,
      });
    }

    // 2. Determine target batch ID
    const batchId = product ? product.id : crop.id;

    // 3. Find any latest or pending blockchain event record
    const latestEvent = await prisma.supplyChainEvent.findFirst({
      where: {
        OR: [
          ...(product ? [{ productId: product.id }] : []),
          ...(crop ? [{ cropId: crop.id }] : []),
        ],
      },
      orderBy: { timestamp: 'desc' },
    });

    // 4. Resolve authoritative evidence payload from system of record:
    // If a produce/crop record exists in the database, the authoritative registered batch data
    // is what was recorded at registration (latestEvent.metadata or canonical DB attributes).
    let authoritativeEvidence: any;
    if (latestEvent?.metadata) {
      try {
        authoritativeEvidence = typeof latestEvent.metadata === 'string'
          ? JSON.parse(latestEvent.metadata)
          : latestEvent.metadata;
      } catch {
        authoritativeEvidence = { metadata: latestEvent.metadata };
      }
    } else {
      authoritativeEvidence = {
        batchId,
        cropName: crop ? crop.name : product.name,
        cropType: crop ? crop.type : 'PRODUCE',
        farmName: crop?.farm?.name || 'AgroTrace Partner Farm',
        plantingDate: crop?.plantingDate || new Date().toISOString(),
        variety: crop?.variety || null,
        status: product?.status || crop?.growthStage || 'ACTIVE',
      };
    }

    // Resolve client-supplied evidence if explicitly provided
    let clientSuppliedEvidence: any = null;
    if (req.body?.evidence) {
      clientSuppliedEvidence = req.body.evidence;
    } else if (req.query?.evidence) {
      try {
        clientSuppliedEvidence = typeof req.query.evidence === 'string'
          ? JSON.parse(req.query.evidence)
          : req.query.evidence;
      } catch (e) {
        clientSuppliedEvidence = { raw: req.query.evidence };
      }
    }

    // Security check: Client-supplied evidence must NEVER override authoritative registered data.
    // If client supplied custom evidence, verify that it does not contradict the authoritative stored record.
    let evidencePayload = authoritativeEvidence;
    if (clientSuppliedEvidence) {
      const authHash = hashEvidence(authoritativeEvidence);
      const clientHash = hashEvidence(clientSuppliedEvidence);
      if (authHash !== clientHash) {
        // Manipulated or altered client payload detected: client evidence diverges from stored record
        return res.json({
          success: true,
          data: {
            status: 'MISMATCH',
            batchId,
            batchIdBytes32: toBatchIdBytes32(batchId),
            onChainBatchExists: true,
            computedEvidenceHash: clientHash,
            onChainEvidenceHash: authHash,
            match: false,
            details: 'Evidence hash mismatch: client-supplied evidence contradicts authoritative registered batch data.',
            produceDetails: {
              id: batchId,
              name: crop ? crop.name : product.name,
              farm: crop?.farm?.name,
            },
          },
        });
      }
      evidencePayload = authoritativeEvidence;
    }

    const eventType = req.query?.eventType !== undefined
      ? toRegistryEventType(req.query.eventType as string)
      : (req.body?.eventType !== undefined
        ? toRegistryEventType(req.body.eventType)
        : (latestEvent ? toRegistryEventType(latestEvent.eventType) : RegistryEventType.PLANTED));

    const pendingTxHash = (latestEvent?.chainStatus === 'PENDING' || latestEvent?.chainStatus === 'SUBMITTED')
      ? (latestEvent.transactionHash || undefined)
      : undefined;

    // 5. Perform truthful on-chain verification
    const verification = await blockchainService.verifyOnChain(
      batchId,
      eventType,
      evidencePayload,
      pendingTxHash
    );

    res.json({
      success: true,
      data: {
        ...verification,
        produceDetails: {
          id: batchId,
          name: crop ? crop.name : product.name,
          farm: crop?.farm?.name,
        },
      },
    });
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    res.status(500).json({
      success: false,
      error: 'On-chain verification error',
      message: error?.message || 'Failed to verify on-chain',
    });
  }
};

