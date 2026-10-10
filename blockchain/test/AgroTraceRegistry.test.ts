import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("AgroTraceRegistry", function () {
  let registry: any;
  let admin: any;
  let relayer: any;
  let pauser: any;
  let farmer: any;
  let carrier: any;
  let distributor: any;
  let unauthorized: any;

  // Enum mapping matching contract
  const EventType = {
    PLANTED: 0,
    HARVESTED: 1,
    PROCESSED: 2,
    PACKAGED: 3,
    SHIPPED: 4,
    RECEIVED: 5,
    QUALITY_CHECK: 6,
    RETAIL: 7,
    SOLD: 8,
  };

  // Helper hashes
  const batchId1 = ethers.keccak256(ethers.toUtf8Bytes("BATCH-2026-WHEAT-001"));
  const batchId2 = ethers.keccak256(ethers.toUtf8Bytes("BATCH-2026-RICE-002"));
  const initialEvidence1 = ethers.keccak256(ethers.toUtf8Bytes("initial-evidence-seed-wheat-field-a"));
  const initialEvidence2 = ethers.keccak256(ethers.toUtf8Bytes("initial-evidence-rice-variety-b"));
  const harvestEvidence = ethers.keccak256(ethers.toUtf8Bytes("harvest-evidence-temp-moisture-ok"));
  const shippedEvidence = ethers.keccak256(ethers.toUtf8Bytes("shipped-carrier-truck-123"));
  const receivedEvidence = ethers.keccak256(ethers.toUtf8Bytes("received-warehouse-hub-4"));
  const qualityCheck1 = ethers.keccak256(ethers.toUtf8Bytes("lab-test-grade-A-moisture-12"));
  const qualityCheck2 = ethers.keccak256(ethers.toUtf8Bytes("distribution-check-packaging-intact"));

  beforeEach(async function () {
    [admin, relayer, pauser, farmer, carrier, distributor, unauthorized] = await ethers.getSigners();

    const AgroTraceRegistryFactory = await ethers.getContractFactory("AgroTraceRegistry");
    registry = await AgroTraceRegistryFactory.deploy(admin.address, relayer.address);
    await registry.waitForDeployment();
  });

  describe("1. Deployment & Role Setup", function () {
    it("Should correctly initialize DEFAULT_ADMIN_ROLE and PAUSER_ROLE to admin", async function () {
      const defaultAdminRole = await registry.DEFAULT_ADMIN_ROLE();
      const pauserRole = await registry.PAUSER_ROLE();
      expect(await registry.hasRole(defaultAdminRole, admin.address)).to.be.true;
      expect(await registry.hasRole(pauserRole, admin.address)).to.be.true;
    });

    it("Should correctly initialize RELAYER_ROLE to relayer", async function () {
      const relayerRole = await registry.RELAYER_ROLE();
      expect(await registry.hasRole(relayerRole, relayer.address)).to.be.true;
      expect(await registry.hasRole(relayerRole, unauthorized.address)).to.be.false;
    });

    it("Should revert if admin or relayer is zero address", async function () {
      const Factory = await ethers.getContractFactory("AgroTraceRegistry");
      await expect(
        Factory.deploy(ethers.ZeroAddress, relayer.address)
      ).to.be.revertedWith("Admin cannot be zero address");

      await expect(
        Factory.deploy(admin.address, ethers.ZeroAddress)
      ).to.be.revertedWith("Relayer cannot be zero address");
    });
  });

  describe("2. Batch Registration (Requirement 1, 2, 4, 15)", function () {
    it("Authorized batch registration succeeds with atomic initial event", async function () {
      const tx = await registry
        .connect(relayer)
        .registerBatch(batchId1, EventType.PLANTED, initialEvidence1, farmer.address);

      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const expectedTimestamp = block!.timestamp;

      // Verify emitted BatchRegistered event
      await expect(tx)
        .to.emit(registry, "BatchRegistered")
        .withArgs(
          batchId1,
          EventType.PLANTED,
          initialEvidence1,
          expectedTimestamp,
          relayer.address,
          farmer.address
        );

      // Verify emitted EventRecorded event at index 0
      await expect(tx)
        .to.emit(registry, "EventRecorded")
        .withArgs(
          batchId1,
          EventType.PLANTED,
          initialEvidence1,
          0,
          expectedTimestamp,
          relayer.address,
          farmer.address
        );

      // Verify batch summary
      const batch = await registry.getBatch(batchId1);
      expect(batch.id).to.equal(batchId1);
      expect(batch.initialEventType).to.equal(EventType.PLANTED);
      expect(batch.initialEvidenceHash).to.equal(initialEvidence1);
      expect(batch.registeredAt).to.equal(expectedTimestamp);
      expect(batch.exists).to.be.true;
      expect(batch.eventCount).to.equal(1n);

      // Verify initial event is retrievable at index 0
      const evt0 = await registry.getEventByIndex(batchId1, 0);
      expect(evt0.eventType).to.equal(EventType.PLANTED);
      expect(evt0.evidenceHash).to.equal(initialEvidence1);
      expect(evt0.timestamp).to.equal(expectedTimestamp);
      expect(evt0.submitter).to.equal(relayer.address);
      expect(evt0.originatingActor).to.equal(farmer.address);

      // Verify initial commitment exists
      expect(
        await registry.verifyCommitment(batchId1, EventType.PLANTED, initialEvidence1)
      ).to.be.true;
    });

    it("Rejects zero batchId or zero evidenceHash (Requirement 4)", async function () {
      await expect(
        registry.connect(relayer).registerBatch(ethers.ZeroHash, EventType.PLANTED, initialEvidence1, farmer.address)
      ).to.be.revertedWith("Batch ID cannot be zero");

      await expect(
        registry.connect(relayer).registerBatch(batchId1, EventType.PLANTED, ethers.ZeroHash, farmer.address)
      ).to.be.revertedWith("Evidence hash cannot be zero");
    });

    it("Duplicate batch registration reverts (Requirement 3)", async function () {
      await registry
        .connect(relayer)
        .registerBatch(batchId1, EventType.PLANTED, initialEvidence1, farmer.address);

      await expect(
        registry
          .connect(relayer)
          .registerBatch(batchId1, EventType.PLANTED, initialEvidence1, farmer.address)
      ).to.be.revertedWith("Batch already registered");
    });

    it("Unauthorized registration is rejected (Requirement 5)", async function () {
      const relayerRole = await registry.RELAYER_ROLE();
      await expect(
        registry
          .connect(unauthorized)
          .registerBatch(batchId1, EventType.PLANTED, initialEvidence1, farmer.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorized.address, relayerRole);
    });
  });

  describe("3. Supply Chain Event Recording (Requirement 6, 7, 8, 9, 10)", function () {
    beforeEach(async function () {
      await registry
        .connect(relayer)
        .registerBatch(batchId1, EventType.PLANTED, initialEvidence1, farmer.address);
    });

    it("Valid events can be appended to an existing batch (Requirement 7)", async function () {
      const tx = await registry
        .connect(relayer)
        .recordEvent(batchId1, EventType.HARVESTED, harvestEvidence, farmer.address);

      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const expectedTimestamp = block!.timestamp;

      await expect(tx)
        .to.emit(registry, "EventRecorded")
        .withArgs(
          batchId1,
          EventType.HARVESTED,
          harvestEvidence,
          1, // Index 1
          expectedTimestamp,
          relayer.address,
          farmer.address
        );

      expect(await registry.getEventCount(batchId1)).to.equal(2n);

      const evt1 = await registry.getEventByIndex(batchId1, 1);
      expect(evt1.eventType).to.equal(EventType.HARVESTED);
      expect(evt1.evidenceHash).to.equal(harvestEvidence);
      expect(evt1.timestamp).to.equal(expectedTimestamp);
      expect(evt1.submitter).to.equal(relayer.address);
      expect(evt1.originatingActor).to.equal(farmer.address);
    });

    it("Unauthorized event recording is rejected (Requirement 6)", async function () {
      const relayerRole = await registry.RELAYER_ROLE();
      await expect(
        registry
          .connect(unauthorized)
          .recordEvent(batchId1, EventType.HARVESTED, harvestEvidence, farmer.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorized.address, relayerRole);
    });

    it("Events cannot be appended to nonexistent batches (Requirement 8)", async function () {
      const unregBatchId = ethers.keccak256(ethers.toUtf8Bytes("NON-EXISTENT-BATCH"));
      await expect(
        registry
          .connect(relayer)
          .recordEvent(unregBatchId, EventType.HARVESTED, harvestEvidence, farmer.address)
      ).to.be.revertedWith("Batch does not exist");
    });

    it("Zero evidence hash is rejected in recordEvent (Requirement 4)", async function () {
      await expect(
        registry
          .connect(relayer)
          .recordEvent(batchId1, EventType.HARVESTED, ethers.ZeroHash, farmer.address)
      ).to.be.revertedWith("Evidence hash cannot be zero");
    });

    it("Duplicate logical event commitments are rejected (Requirement 9)", async function () {
      // Record harvest event
      await registry
        .connect(relayer)
        .recordEvent(batchId1, EventType.HARVESTED, harvestEvidence, farmer.address);

      // Re-recording the exact same harvest evidence on batchId1 must revert
      await expect(
        registry
          .connect(relayer)
          .recordEvent(batchId1, EventType.HARVESTED, harvestEvidence, farmer.address)
      ).to.be.revertedWith("Duplicate event commitment");

      // Attempting to record the initial registration commitment again must also revert
      await expect(
        registry
          .connect(relayer)
          .recordEvent(batchId1, EventType.PLANTED, initialEvidence1, farmer.address)
      ).to.be.revertedWith("Duplicate event commitment");
    });

    it("Distinct legitimate events of the same eventType are accepted (Requirement 10)", async function () {
      // Event 1: First quality check at farm
      await registry
        .connect(relayer)
        .recordEvent(batchId1, EventType.QUALITY_CHECK, qualityCheck1, farmer.address);

      // Event 2: Second quality check at distributor (different evidence hash)
      await registry
        .connect(relayer)
        .recordEvent(batchId1, EventType.QUALITY_CHECK, qualityCheck2, distributor.address);

      expect(await registry.getEventCount(batchId1)).to.equal(3n);

      expect(
        await registry.verifyCommitment(batchId1, EventType.QUALITY_CHECK, qualityCheck1)
      ).to.be.true;
      expect(
        await registry.verifyCommitment(batchId1, EventType.QUALITY_CHECK, qualityCheck2)
      ).to.be.true;
    });

    it("Full supply-chain progression succeeds across all stages", async function () {
      await registry.connect(relayer).recordEvent(batchId1, EventType.HARVESTED, harvestEvidence, farmer.address);
      await registry.connect(relayer).recordEvent(batchId1, EventType.PROCESSED, ethers.keccak256(ethers.toUtf8Bytes("proc")), farmer.address);
      await registry.connect(relayer).recordEvent(batchId1, EventType.PACKAGED, ethers.keccak256(ethers.toUtf8Bytes("pack")), farmer.address);
      await registry.connect(relayer).recordEvent(batchId1, EventType.SHIPPED, shippedEvidence, carrier.address);
      await registry.connect(relayer).recordEvent(batchId1, EventType.RECEIVED, receivedEvidence, distributor.address);
      await registry.connect(relayer).recordEvent(batchId1, EventType.QUALITY_CHECK, qualityCheck1, distributor.address);
      await registry.connect(relayer).recordEvent(batchId1, EventType.RETAIL, ethers.keccak256(ethers.toUtf8Bytes("retail")), distributor.address);
      await registry.connect(relayer).recordEvent(batchId1, EventType.SOLD, ethers.keccak256(ethers.toUtf8Bytes("sold")), distributor.address);

      expect(await registry.getEventCount(batchId1)).to.equal(9n);
    });
  });

  describe("4. Emergency Pause & Controlled Unpause (Requirement 11, 12, 13)", function () {
    it("Only authorized pauser can pause and unpause (Requirement 12)", async function () {
      const pauserRole = await registry.PAUSER_ROLE();

      // Unauthorized cannot pause
      await expect(
        registry.connect(unauthorized).pause()
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorized.address, pauserRole);

      // Admin (with PAUSER_ROLE) can pause
      await expect(registry.connect(admin).pause())
        .to.emit(registry, "Paused")
        .withArgs(admin.address);

      expect(await registry.paused()).to.be.true;

      // Unauthorized cannot unpause
      await expect(
        registry.connect(unauthorized).unpause()
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorized.address, pauserRole);

      // Admin can unpause
      await expect(registry.connect(admin).unpause())
        .to.emit(registry, "Unpaused")
        .withArgs(admin.address);

      expect(await registry.paused()).to.be.false;
    });

    it("Pause blocks state-changing operations (Requirement 11)", async function () {
      await registry.connect(admin).pause();

      await expect(
        registry
          .connect(relayer)
          .registerBatch(batchId1, EventType.PLANTED, initialEvidence1, farmer.address)
      ).to.be.revertedWithCustomError(registry, "EnforcedPause");

      // Unpause to register batch
      await registry.connect(admin).unpause();
      await registry
        .connect(relayer)
        .registerBatch(batchId1, EventType.PLANTED, initialEvidence1, farmer.address);

      // Pause again
      await registry.connect(admin).pause();

      await expect(
        registry
          .connect(relayer)
          .recordEvent(batchId1, EventType.HARVESTED, harvestEvidence, farmer.address)
      ).to.be.revertedWithCustomError(registry, "EnforcedPause");
    });

    it("Unpause restores normal operations (Requirement 13)", async function () {
      await registry.connect(admin).pause();
      await registry.connect(admin).unpause();

      // Should succeed normally after unpause
      await expect(
        registry
          .connect(relayer)
          .registerBatch(batchId1, EventType.PLANTED, initialEvidence1, farmer.address)
      ).to.not.be.reverted;
    });
  });

  describe("5. Query Interface, Pagination & Read Idempotency (Requirement 14, 16)", function () {
    beforeEach(async function () {
      await registry
        .connect(relayer)
        .registerBatch(batchId1, EventType.PLANTED, initialEvidence1, farmer.address);
      await registry
        .connect(relayer)
        .recordEvent(batchId1, EventType.HARVESTED, harvestEvidence, farmer.address);
      await registry
        .connect(relayer)
        .recordEvent(batchId1, EventType.SHIPPED, shippedEvidence, carrier.address);
    });

    it("Event counts and indexed queries are correct (Requirement 14)", async function () {
      expect(await registry.getEventCount(batchId1)).to.equal(3n);

      const evt0 = await registry.getEventByIndex(batchId1, 0);
      expect(evt0.eventType).to.equal(EventType.PLANTED);
      expect(evt0.originatingActor).to.equal(farmer.address);

      const evt1 = await registry.getEventByIndex(batchId1, 1);
      expect(evt1.eventType).to.equal(EventType.HARVESTED);
      expect(evt1.originatingActor).to.equal(farmer.address);

      const evt2 = await registry.getEventByIndex(batchId1, 2);
      expect(evt2.eventType).to.equal(EventType.SHIPPED);
      expect(evt2.originatingActor).to.equal(carrier.address);

      // Out of bounds index reverts
      await expect(
        registry.getEventByIndex(batchId1, 3)
      ).to.be.revertedWith("Event index out of bounds");
    });

    it("getBatchEvents returns complete event array", async function () {
      const allEvents = await registry.getBatchEvents(batchId1);
      expect(allEvents.length).to.equal(3);
      expect(allEvents[0].evidenceHash).to.equal(initialEvidence1);
      expect(allEvents[1].evidenceHash).to.equal(harvestEvidence);
      expect(allEvents[2].evidenceHash).to.equal(shippedEvidence);
    });

    it("verifyCommitment returns false for unrecorded commitments", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("random-unrecorded-hash"));
      expect(
        await registry.verifyCommitment(batchId1, EventType.SOLD, fakeHash)
      ).to.be.false;
      expect(
        await registry.verifyCommitment(batchId2, EventType.PLANTED, initialEvidence1)
      ).to.be.false;
    });

    it("Repeated reads do not change state (Requirement 16)", async function () {
      const batchBefore = await registry.getBatch(batchId1);
      const countBefore = await registry.getEventCount(batchId1);

      // Perform 5 consecutive reads
      for (let i = 0; i < 5; i++) {
        const batch = await registry.getBatch(batchId1);
        const count = await registry.getEventCount(batchId1);
        expect(batch.id).to.equal(batchBefore.id);
        expect(batch.eventCount).to.equal(batchBefore.eventCount);
        expect(count).to.equal(countBefore);
      }
    });
  });

  describe("6. State Rollback & Atomicity on Failure (Requirement 17)", function () {
    it("Failed registration leaves no partial batch or event state", async function () {
      // Attempt registration with invalid 0 hash
      await expect(
        registry.connect(relayer).registerBatch(batchId2, EventType.PLANTED, ethers.ZeroHash, farmer.address)
      ).to.be.revertedWith("Evidence hash cannot be zero");

      // Verify batch does not exist
      const batch = await registry.getBatch(batchId2);
      expect(batch.exists).to.be.false;
      expect(batch.eventCount).to.equal(0n);
      expect(await registry.getEventCount(batchId2)).to.equal(0n);

      // Verify no commitment was stored
      expect(
        await registry.verifyCommitment(batchId2, EventType.PLANTED, ethers.ZeroHash)
      ).to.be.false;
    });

    it("Failed event recording leaves existing batch state untouched", async function () {
      await registry
        .connect(relayer)
        .registerBatch(batchId1, EventType.PLANTED, initialEvidence1, farmer.address);

      expect(await registry.getEventCount(batchId1)).to.equal(1n);

      // Attempt event with 0 hash
      await expect(
        registry.connect(relayer).recordEvent(batchId1, EventType.HARVESTED, ethers.ZeroHash, farmer.address)
      ).to.be.revertedWith("Evidence hash cannot be zero");

      // Count is still 1
      expect(await registry.getEventCount(batchId1)).to.equal(1n);

      // Event at index 0 is intact
      const evt0 = await registry.getEventByIndex(batchId1, 0);
      expect(evt0.evidenceHash).to.equal(initialEvidence1);
    });
  });
});
