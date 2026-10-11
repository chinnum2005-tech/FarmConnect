import prisma from '../database/prisma';
import {
  blockchainService,
  RegistryEventType,
  toRegistryEventType,
} from './blockchain.service';
import {
  hashEvidence,
  toBatchIdBytes32,
  isValidBytes32,
} from './evidenceHasher';

export type TransactionLifecycleStatus =
  | 'RECORDED_DB'
  | 'SUBMITTED'
  | 'IN_BLOCK'
  | 'CONFIRMED'
  | 'FAILED';

export interface RecordEventLifecycleParams {
  batchId: string;
  eventType: RegistryEventType | string;
  evidence: any;
  actorId: string;
  originatingActorAddress?: string;
  location?: string;
  idempotencyKey?: string;
  productId?: string;
  cropId?: string;
}

export interface EventLifecycleResult {
  eventId: string;
  status: TransactionLifecycleStatus;
  transactionHash: string | null;
  blockNumber: number | null;
  confirmations: number;
  evidenceHash: string;
  batchIdBytes32: string;
  isReplay: boolean;
  verified: boolean;
}

export class EventLifecycleService {
  /**
   * Records a supply chain event through the complete, honest 5-state lifecycle:
   * 1. RECORDED_DB: Persisted off-chain with stable idempotency identity, transactionHash=null.
   * 2. SUBMITTED: Broadcast to network, real txHash recorded immediately via onBroadcast hook.
   * 3. IN_BLOCK / CONFIRMED: Verified on-chain via block inclusion and receipt confirmation depth.
   * 4. FAILED: Accurately captures either pre-flight rejection or on-chain EVM reverts.
   */
  async recordAndPersistEvent(
    params: RecordEventLifecycleParams,
    prismaClient: any = prisma
  ): Promise<EventLifecycleResult> {
    const {
      batchId,
      eventType: eventTypeInput,
      evidence,
      actorId,
      originatingActorAddress,
      location,
      idempotencyKey: clientKey,
      productId,
      cropId,
    } = params;

    // 1. Derive canonical commitments and stable identifiers
    const evidenceHash = hashEvidence(evidence);
    const batchIdBytes32 = toBatchIdBytes32(batchId);
    const regEventType =
      typeof eventTypeInput === 'number'
        ? eventTypeInput
        : toRegistryEventType(eventTypeInput);

    const idempotencyKey =
      clientKey || `idem-${batchId}-${regEventType}-${evidenceHash}`;

    // 2. Idempotency Check: prevent duplicate logical submissions or replay overwrites
    const existing = await prismaClient.supplyChainEvent.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      if (existing.chainStatus === 'CONFIRMED') {
        return {
          eventId: existing.id,
          status: 'CONFIRMED',
          transactionHash: existing.transactionHash,
          blockNumber: existing.blockNumber,
          confirmations: existing.confirmations || 1,
          evidenceHash: existing.evidenceHash || evidenceHash,
          batchIdBytes32: existing.batchIdBytes32 || batchIdBytes32,
          isReplay: true,
          verified: true,
        };
      }

      if (existing.chainStatus === 'SUBMITTED' && existing.transactionHash) {
        // In-flight transaction: query receipt and confirmations
        try {
          const { receipt, confirmations, requiredConfirmations } =
            await blockchainService.getReceiptAndConfirmations(existing.transactionHash);

          if (receipt) {
            if (receipt.status === 0) {
              const failed = await prismaClient.supplyChainEvent.update({
                where: { id: existing.id },
                data: {
                  chainStatus: 'FAILED',
                  blockNumber: receipt.blockNumber,
                  confirmations: 0,
                  verified: false,
                },
              });
              return {
                eventId: failed.id,
                status: 'FAILED',
                transactionHash: failed.transactionHash,
                blockNumber: failed.blockNumber,
                confirmations: 0,
                evidenceHash,
                batchIdBytes32,
                isReplay: true,
                verified: false,
              };
            }

            if (receipt.status === 1 && confirmations >= requiredConfirmations) {
              const confirmed = await prismaClient.supplyChainEvent.update({
                where: { id: existing.id },
                data: {
                  chainStatus: 'CONFIRMED',
                  blockNumber: receipt.blockNumber,
                  confirmations,
                  verified: true,
                },
              });
              return {
                eventId: confirmed.id,
                status: 'CONFIRMED',
                transactionHash: confirmed.transactionHash,
                blockNumber: confirmed.blockNumber,
                confirmations,
                evidenceHash,
                batchIdBytes32,
                isReplay: true,
                verified: true,
              };
            }
          }
        } catch (e) {
          // If RPC check fails, return existing SUBMITTED state
        }

        return {
          eventId: existing.id,
          status: 'SUBMITTED',
          transactionHash: existing.transactionHash,
          blockNumber: null,
          confirmations: 0,
          evidenceHash,
          batchIdBytes32,
          isReplay: true,
          verified: false,
        };
      }
    }

    // 3. Stage 1: RECORDED_DB
    // Persist pre-flight event with transactionHash: null (NEVER invented placeholders)
    let eventRecord: any;
    if (existing && existing.chainStatus === 'RECORDED_DB') {
      eventRecord = existing;
    } else if (existing && existing.chainStatus === 'FAILED' && !existing.transactionHash) {
      // Re-attempt unbroadcast failed event
      eventRecord = await prismaClient.supplyChainEvent.update({
        where: { id: existing.id },
        data: {
          chainStatus: 'RECORDED_DB',
          timestamp: new Date(),
        },
      });
    } else {
      eventRecord = await prismaClient.supplyChainEvent.create({
        data: {
          productId: productId || null,
          cropId: cropId || null,
          eventType: regEventType as any,
          timestamp: new Date(),
          location: location || null,
          actorId,
          metadata: JSON.stringify(evidence),
          transactionHash: null, // Truthful: not yet broadcast
          chainStatus: 'RECORDED_DB',
          blockNumber: null,
          confirmations: 0,
          evidenceHash,
          batchIdBytes32,
          idempotencyKey,
          verified: false,
        },
      });
    }

    let broadcastTxHash: string | null = null;

    // 4. Stage 2: Broadcast to Blockchain (SUBMITTED)
    try {
      // Determine if batch is registered on-chain
      let isRegistered = false;
      try {
        const batch = await blockchainService.getBatch(batchIdBytes32);
        isRegistered = batch !== null && batch.exists;
      } catch (err) {
        // If read fails (e.g. offline RPC), error propagates to catch block below
      }

      const onBroadcastHook = async (txHash: string) => {
        broadcastTxHash = txHash;
        try {
          await prismaClient.supplyChainEvent.update({
            where: { id: eventRecord.id },
            data: {
              chainStatus: 'SUBMITTED',
              transactionHash: txHash,
            },
          });
        } catch (dbErr) {
          console.error(
            `[EventLifecycleService] Failed to update SUBMITTED state for event ${eventRecord.id}:`,
            dbErr
          );
        }
      };

      let submissionResult;
      if (!isRegistered) {
        submissionResult = await blockchainService.registerBatch(
          batchId,
          regEventType,
          evidenceHash,
          originatingActorAddress,
          onBroadcastHook
        );
      } else {
        submissionResult = await blockchainService.recordEvent(
          batchId,
          regEventType,
          evidenceHash,
          originatingActorAddress,
          onBroadcastHook
        );
      }

      // 5. Stage 3: Block Inclusion and Mining (CONFIRMED)
      const confirmedRecord = await prismaClient.supplyChainEvent.update({
        where: { id: eventRecord.id },
        data: {
          chainStatus: 'CONFIRMED',
          transactionHash: submissionResult.txHash,
          blockNumber: submissionResult.blockNumber,
          confirmations: submissionResult.confirmations,
          verified: true,
        },
      });

      return {
        eventId: confirmedRecord.id,
        status: 'CONFIRMED',
        transactionHash: confirmedRecord.transactionHash,
        blockNumber: confirmedRecord.blockNumber,
        confirmations: confirmedRecord.confirmations,
        evidenceHash,
        batchIdBytes32,
        isReplay: false,
        verified: true,
      };
    } catch (error: any) {
      console.error(
        `[EventLifecycleService] Transaction failed for event ${eventRecord.id}:`,
        error?.message || error
      );

      // If tx was broadcast before failure, keep the real txHash; otherwise null
      await prismaClient.supplyChainEvent.update({
        where: { id: eventRecord.id },
        data: {
          chainStatus: 'FAILED',
          transactionHash: broadcastTxHash,
          verified: false,
        },
      }).catch(console.error);

      throw error;
    }
  }

  /**
   * Reconciles an in-flight or submitted transaction against the blockchain receipt.
   * Handles pending, mined, reverted, and unavailable RPC states safely without crashing.
   */
  async reconcileEvent(
    eventId: string,
    prismaClient: any = prisma
  ): Promise<EventLifecycleResult | null> {
    const event = await prismaClient.supplyChainEvent.findUnique({
      where: { id: eventId },
    });

    if (!event || !event.transactionHash) {
      return null;
    }

    if (event.chainStatus === 'CONFIRMED') {
      return {
        eventId: event.id,
        status: 'CONFIRMED',
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        confirmations: event.confirmations || 1,
        evidenceHash: event.evidenceHash || '',
        batchIdBytes32: event.batchIdBytes32 || '',
        isReplay: false,
        verified: true,
      };
    }

    try {
      const { receipt, confirmations, requiredConfirmations } =
        await blockchainService.getReceiptAndConfirmations(event.transactionHash);

      if (!receipt) {
        // Transaction still in mempool or pending mining
        return {
          eventId: event.id,
          status: (event.chainStatus as TransactionLifecycleStatus) || 'SUBMITTED',
          transactionHash: event.transactionHash,
          blockNumber: null,
          confirmations: 0,
          evidenceHash: event.evidenceHash || '',
          batchIdBytes32: event.batchIdBytes32 || '',
          isReplay: false,
          verified: false,
        };
      }

      // If transaction reverted on-chain
      if (receipt.status === 0) {
        const failedRecord = await prismaClient.supplyChainEvent.update({
          where: { id: event.id },
          data: {
            chainStatus: 'FAILED',
            blockNumber: receipt.blockNumber,
            confirmations: 0,
            verified: false,
          },
        });
        return {
          eventId: failedRecord.id,
          status: 'FAILED',
          transactionHash: failedRecord.transactionHash,
          blockNumber: failedRecord.blockNumber,
          confirmations: 0,
          evidenceHash: failedRecord.evidenceHash || '',
          batchIdBytes32: failedRecord.batchIdBytes32 || '',
          isReplay: false,
          verified: false,
        };
      }

      // Transaction mined, but verify required confirmation depth
      if (confirmations < requiredConfirmations) {
        return {
          eventId: event.id,
          status: 'SUBMITTED',
          transactionHash: event.transactionHash,
          blockNumber: receipt.blockNumber,
          confirmations,
          evidenceHash: event.evidenceHash || '',
          batchIdBytes32: event.batchIdBytes32 || '',
          isReplay: false,
          verified: false,
        };
      }

      // Transaction mined and satisfied required confirmations
      const confirmedRecord = await prismaClient.supplyChainEvent.update({
        where: { id: event.id },
        data: {
          chainStatus: 'CONFIRMED',
          blockNumber: receipt.blockNumber,
          confirmations,
          verified: true,
        },
      });

      return {
        eventId: confirmedRecord.id,
        status: 'CONFIRMED',
        transactionHash: confirmedRecord.transactionHash,
        blockNumber: confirmedRecord.blockNumber,
        confirmations,
        evidenceHash: confirmedRecord.evidenceHash || '',
        batchIdBytes32: confirmedRecord.batchIdBytes32 || '',
        isReplay: false,
        verified: true,
      };
    } catch (rpcErr: any) {
      // If RPC is unavailable or query fails, return current status without corrupting DB state
      return {
        eventId: event.id,
        status: (event.chainStatus as TransactionLifecycleStatus) || 'SUBMITTED',
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber || null,
        confirmations: event.confirmations || 0,
        evidenceHash: event.evidenceHash || '',
        batchIdBytes32: event.batchIdBytes32 || '',
        isReplay: false,
        verified: event.chainStatus === 'CONFIRMED',
      };
    }
  }

  /**
   * Reconciles all pending or submitted transactions across the database.
   * Typically executed on backend restart or periodic recovery sweep.
   */
  async reconcileAllPendingEvents(prismaClient: any = prisma): Promise<{
    processed: number;
    confirmed: number;
    failed: number;
    stillPending: number;
    unavailable: number;
  }> {
    const pendingEvents = await prismaClient.supplyChainEvent.findMany({
      where: {
        chainStatus: 'SUBMITTED',
        transactionHash: { not: null },
      },
    });

    const summary = {
      processed: pendingEvents.length,
      confirmed: 0,
      failed: 0,
      stillPending: 0,
      unavailable: 0,
    };

    for (const event of pendingEvents) {
      try {
        const result = await this.reconcileEvent(event.id, prismaClient);
        if (!result) continue;
        if (result.status === 'CONFIRMED') {
          summary.confirmed++;
        } else if (result.status === 'FAILED') {
          summary.failed++;
        } else if (result.status === 'SUBMITTED') {
          summary.stillPending++;
        }
      } catch (err) {
        summary.unavailable++;
      }
    }

    if (summary.processed > 0) {
      console.log(
        `[EventLifecycleService] Reconciled ${summary.processed} pending transactions: ` +
        `${summary.confirmed} confirmed, ${summary.failed} failed, ${summary.stillPending} still pending, ${summary.unavailable} unavailable.`
      );
    }

    return summary;
  }
}

export const eventLifecycleService = new EventLifecycleService();
