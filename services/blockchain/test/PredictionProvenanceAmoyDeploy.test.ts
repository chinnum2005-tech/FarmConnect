import { expect } from "chai";
import { ethers } from "hardhat";
import { PredictionProvenance } from "../typechain-types";
import { runProvenanceDeployment } from "../scripts/deploy-provenance";
import hre from "hardhat";

describe("Directive 023: PredictionProvenance Deployment & Role Handover (Hardhat)", function () {
  let deployer: any;
  let admin: any;
  let relayer: any;
  let unauthorizedUser: any;
  let provenance: PredictionProvenance;

  // Helper for bytes32 hex
  const randomBytes32 = (prefix: string) => {
    const hex = Buffer.from(prefix.padEnd(32, "x")).toString("hex");
    return "0x" + hex.slice(0, 64);
  };

  const predictionId = randomBytes32("PRED-DIR023");
  const predictionHash = randomBytes32("HASH-DIR023");

  beforeEach(async function () {
    [deployer, admin, relayer, unauthorizedUser] = await ethers.getSigners();

    // Configure env vars for local deployment script execution
    process.env.LOCAL_ADMIN_ADDRESS = admin.address;
    process.env.LOCAL_RELAYER_ADDRESS = relayer.address;
    delete process.env.AMOY_ADMIN_ADDRESS;
    delete process.env.AMOY_RELAYER_ADDRESS;

    // Run the deployment sequence
    const result = await runProvenanceDeployment(hre);
    expect(result.status).to.equal("DEPLOYED");
    expect(result.address).to.be.properAddress;

    provenance = await ethers.getContractAt("PredictionProvenance", result.address!) as PredictionProvenance;
  });

  afterEach(function () {
    delete process.env.LOCAL_ADMIN_ADDRESS;
    delete process.env.LOCAL_RELAYER_ADDRESS;
  });

  // Requirement 5: The deployment assigns the intended roles
  it("Requirement 5: Assigns WRITER_ROLE to relayer and DEFAULT_ADMIN_ROLE + PAUSER_ROLE to admin", async function () {
    const DEFAULT_ADMIN_ROLE = await provenance.DEFAULT_ADMIN_ROLE();
    const WRITER_ROLE = await provenance.WRITER_ROLE();
    const PAUSER_ROLE = await provenance.PAUSER_ROLE();

    // Admin holds admin and pauser
    expect(await provenance.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    expect(await provenance.hasRole(PAUSER_ROLE, admin.address)).to.be.true;
    expect(await provenance.hasRole(WRITER_ROLE, admin.address)).to.be.false;

    // Relayer holds writer only
    expect(await provenance.hasRole(WRITER_ROLE, relayer.address)).to.be.true;
    expect(await provenance.hasRole(DEFAULT_ADMIN_ROLE, relayer.address)).to.be.false;
    expect(await provenance.hasRole(PAUSER_ROLE, relayer.address)).to.be.false;
  });

  // Requirement 6: Intended relayer can call recordPredictionHash
  it("Requirement 6: The intended relayer can successfully anchor predictions", async function () {
    const relayerProvenance = provenance.connect(relayer);
    const tx = await relayerProvenance.recordPredictionHash(predictionId, predictionHash, 0);
    const receipt = await tx.wait();
    expect(receipt?.status).to.equal(1);

    const record = await provenance.getPredictionProvenance(predictionId);
    expect(record.hash).to.equal(predictionHash);
    expect(record.predictionType).to.equal(0n);
  });

  // Requirement 7: Unauthorized account cannot call recordPredictionHash
  it("Requirement 7: Unauthorized accounts cannot record prediction hashes", async function () {
    const unauthorizedProvenance = provenance.connect(unauthorizedUser);
    await expect(
      unauthorizedProvenance.recordPredictionHash(predictionId, predictionHash, 0)
    ).to.be.revertedWithCustomError(provenance, "AccessControlUnauthorizedAccount");
  });

  // Requirement 8: Administrator has administrative and pause permissions
  it("Requirement 8: The intended administrator can pause/unpause and manage roles", async function () {
    const adminProvenance = provenance.connect(admin);

    // Admin can pause
    await adminProvenance.pause();
    expect(await provenance.paused()).to.be.true;

    // Paused contract blocks relayer
    const relayerProvenance = provenance.connect(relayer);
    await expect(
      relayerProvenance.recordPredictionHash(predictionId, predictionHash, 0)
    ).to.be.revertedWithCustomError(provenance, "EnforcedPause");

    // Admin can unpause
    await adminProvenance.unpause();
    expect(await provenance.paused()).to.be.false;

    // Relayer can now record
    await expect(
      relayerProvenance.recordPredictionHash(predictionId, predictionHash, 0)
    ).to.emit(provenance, "PredictionAnchored");
  });

  // Requirement 9: Final role handover does not remove all administrators
  it("Requirement 9: Administrative handover strips deployer roles while admin retains DEFAULT_ADMIN_ROLE", async function () {
    const DEFAULT_ADMIN_ROLE = await provenance.DEFAULT_ADMIN_ROLE();
    const WRITER_ROLE = await provenance.WRITER_ROLE();
    const PAUSER_ROLE = await provenance.PAUSER_ROLE();

    // Deployer retains zero roles
    expect(await provenance.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.false;
    expect(await provenance.hasRole(WRITER_ROLE, deployer.address)).to.be.false;
    expect(await provenance.hasRole(PAUSER_ROLE, deployer.address)).to.be.false;

    // Admin retains full administrative control and can grant new roles
    expect(await provenance.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;

    const newWriter = unauthorizedUser;
    const adminProvenance = provenance.connect(admin);
    await adminProvenance.grantRole(WRITER_ROLE, newWriter.address);
    expect(await provenance.hasRole(WRITER_ROLE, newWriter.address)).to.be.true;

    // Deployer cannot grant roles (reverts because deployer renounced DEFAULT_ADMIN_ROLE)
    const deployerProvenance = provenance.connect(deployer);
    await expect(
      deployerProvenance.grantRole(WRITER_ROLE, deployer.address)
    ).to.be.revertedWithCustomError(provenance, "AccessControlUnauthorizedAccount");
  });

  // Requirement 10: Role verified matches WRITER_ROLE hash
  it("Requirement 10: Provenance contract WRITER_ROLE hash matches keccak256('WRITER_ROLE')", async function () {
    const contractWriterRole = await provenance.WRITER_ROLE();
    const expectedHash = ethers.id("WRITER_ROLE");
    expect(contractWriterRole).to.equal(expectedHash);
  });
});
