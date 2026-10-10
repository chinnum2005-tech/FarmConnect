import { ethers } from 'ethers';
import prisma from '../database/prisma';
import fs from 'fs';
import path from 'path';

const PredictionProvenanceABI = [
  "event PredictionAnchored(bytes32 indexed predictionId, bytes32 indexed hash, uint8 predictionType, uint256 blockNumber)"
];

function getContractAddress(): string {
  try {
    const deployInfoPath = path.join(__dirname, '../../../../services/blockchain/deployment-info.json');
    if (fs.existsSync(deployInfoPath)) {
      const data = JSON.parse(fs.readFileSync(deployInfoPath, 'utf8'));
      return data.provenanceAddress;
    }
  } catch (e) {}
  return '0x5FbDB2315678afecb367f032d93F642f64180aa3';
}

export function startProvenanceListener() {
  try {
    const rpcUrl = process.env.POLYGON_RPC_URL || process.env.RPC_URL;
    if (!rpcUrl && process.env.NODE_ENV === 'production') {
      console.log('ℹ️ RPC_URL / POLYGON_RPC_URL not configured. PredictionProvenance listener skipped in production.');
      return;
    }
    const targetRpc = rpcUrl || 'http://localhost:8545';
    const contractAddress = getContractAddress();
    const provider = new ethers.JsonRpcProvider(targetRpc);
    
    // Prevent unhandled errors from crashing node process
    provider.on('error', (err) => {
      console.warn('⚠️ JSON-RPC Provider warning:', err?.message || err);
    });

    const contract = new ethers.Contract(contractAddress, PredictionProvenanceABI, provider);

    console.log(`📡 Starting background event listener for PredictionProvenance at ${contractAddress}...`);

    contract.on("PredictionAnchored", async (predictionIdBytes, hash, typeInt, blockNumber, event) => {
      try {
        // predictionIdBytes is a bytes32 representation: '0x' + UUID (without dashes) + padding
        const cleanHex = predictionIdBytes.slice(2, 34); // Get the UUID part (32 hex characters)
        
        // Reconstruct the UUID style: 8-4-4-4-12
        const uuid = [
          cleanHex.slice(0, 8),
          cleanHex.slice(8, 12),
          cleanHex.slice(12, 16),
          cleanHex.slice(16, 20),
          cleanHex.slice(20)
        ].join('-');

        console.log(`🔔 Event received on-chain: Prediction ${uuid} anchored in block ${blockNumber}`);

        const txHash = event.log.transactionHash;
        
        await prisma.provenanceRecord.updateMany({
          where: { predictionId: uuid },
          data: {
            txHash,
            blockNumber: Number(blockNumber),
            confirmedAt: new Date()
          }
        });

        const predictionType = Number(typeInt) === 0 ? 'YIELD' : 'CROP';
        if (predictionType === 'YIELD') {
          await prisma.yieldPrediction.updateMany({
            where: { id: uuid },
            data: {
              provenanceStatus: 'CONFIRMED',
              txHash
            }
          });
        } else {
          await prisma.cropRecommendation.updateMany({
            where: { id: uuid },
            data: {
              provenanceStatus: 'CONFIRMED',
              txHash
            }
          });
        }

      } catch (err) {
        console.error('Error handling PredictionAnchored event:', err);
      }
    });

  } catch (error) {
    console.error('Failed to initialize PredictionProvenance background listener:', error);
  }
}
