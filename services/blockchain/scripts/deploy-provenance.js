"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_DEV_ACCOUNTS = void 0;
exports.runProvenanceDeployment = runProvenanceDeployment;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Well-known default development accounts generated from standard Hardhat test mnemonic:
 * "test test test test test test test test test test test junk".
 * Strictly prohibited on public testnets or production networks.
 */
exports.KNOWN_DEV_ACCOUNTS = new Set([
    "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
    "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
    "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65",
    "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc",
    "0x976ea74026e72cd1112b570d9a708c2a8684bb12",
    "0x14dc79964da2c08b23698b3d3cc7ca32193d9955",
    "0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f",
    "0xa0ee7a142d267c1f36714e4a8f75612f20a79720",
    "0xbcd4042de499d14e55001ccbb24a551f3b954096",
    "0x71be63f3384f5fb98995898a86b02fb2426c5788",
    "0xfabb0ac9d68b0b445fb7357272ff202c5651694a",
    "0x1cbd3e36470f431611804245acdd698a7764405c",
    "0xd1375aeb05972fb892c0d79c763567d0284f2142",
    "0x928370245242379605691d40854737c3328e9161",
    "0x328809bc894f92807417d2dad6b7c998c1afaac6",
    "0x6813eb9362372eef6200f3b1dbc3f819671cba69",
    "0x2546bcd3277c0b1660f594d764508068752fe5d3",
    "0xcd3b766ccdd6ae721141f452c550ca635964ce71",
]);
/**
 * Executes or preflights the PredictionProvenance smart contract deployment with explicit
 * role assignment (admin + pauser to AMOY_ADMIN_ADDRESS, writer to AMOY_RELAYER_ADDRESS)
 * and safe administrative handover from deployer to admin.
 */
async function runProvenanceDeployment(hreInstance) {
    let activeHre = hreInstance;
    if (!activeHre) {
        try {
            activeHre = require("hardhat");
        }
        catch {
            throw new Error("[Deploy Error] Hardhat runtime environment not available.");
        }
    }
    if (!activeHre || !activeHre.ethers || !activeHre.ethers.provider) {
        throw new Error("[Deploy Error] Hardhat runtime environment not initialized.");
    }
    const network = await activeHre.ethers.provider.getNetwork();
    const chainId = Number(network.chainId);
    const configuredNetworkName = (activeHre.network && activeHre.network.name ? activeHre.network.name : "").toLowerCase();
    const isLocal = chainId === 31337 || chainId === 1337 || configuredNetworkName === "localhost" || configuredNetworkName === "hardhat";
    const isAmoy = chainId === 80002 || configuredNetworkName === "amoy";
    // Guard 1: Disallow mainnet deployment paths unconditionally
    if (chainId === 1 || chainId === 137 || configuredNetworkName === "mainnet" || configuredNetworkName === "polygon") {
        throw new Error(`[Deploy Error] Security violation: Mainnet deployment (chain ID ${chainId}) is strictly prohibited.`);
    }
    // Guard 2: Enforce network and chain ID alignment
    if (configuredNetworkName === "amoy" && chainId !== 80002) {
        throw new Error(`[Deploy Error] Network mismatch: Configured network is "amoy", but connected RPC returned chain ID ${chainId} (expected 80002).`);
    }
    if ((configuredNetworkName === "localhost" || configuredNetworkName === "hardhat") && chainId !== 31337 && chainId !== 1337) {
        throw new Error(`[Deploy Error] Network mismatch: Configured network is "${configuredNetworkName}", but connected RPC returned chain ID ${chainId} (expected 31337 or 1337).`);
    }
    if (!isLocal && !isAmoy) {
        throw new Error(`[Deploy Error] Unsupported network: Chain ID ${chainId} (${configuredNetworkName}) is not supported for deployment.`);
    }
    const networkName = isLocal ? "localhost" : (isAmoy ? "amoy" : configuredNetworkName || `chain-${chainId}`);
    console.log(`==================================================================`);
    console.log(`PredictionProvenance Deployment Tooling`);
    console.log(`Detected Network: ${networkName} (Chain ID: ${chainId})`);
    console.log(`==================================================================`);
    const signers = await activeHre.ethers.getSigners();
    if (!signers || signers.length === 0) {
        throw new Error(`[Deploy Error] No deployment signer configured for network "${networkName}". Set AMOY_DEPLOYER_PRIVATE_KEY in environment.`);
    }
    const deployer = signers[0];
    console.log(`Deployer Account: ${deployer.address}`);
    // Resolve administrative and relayer roles
    let adminAddress;
    let relayerAddress;
    if (isLocal) {
        adminAddress = (process.env.LOCAL_ADMIN_ADDRESS || deployer.address).trim();
        relayerAddress = (process.env.LOCAL_RELAYER_ADDRESS || deployer.address).trim();
    }
    else {
        adminAddress = (process.env.AMOY_ADMIN_ADDRESS || "").trim();
        relayerAddress = (process.env.AMOY_RELAYER_ADDRESS || "").trim();
        if (!adminAddress) {
            throw new Error(`[Deploy Error] AMOY_ADMIN_ADDRESS is required for public network deployment. ` +
                `Administrative handover requires an explicit administrator target.`);
        }
        if (!relayerAddress) {
            throw new Error(`[Deploy Error] AMOY_RELAYER_ADDRESS is required for public network deployment. ` +
                `Using the deployment account as the operational relayer on public testnets is prohibited without explicit configuration.`);
        }
    }
    // Guard 3: Validate address formatting
    if (!activeHre.ethers.isAddress(adminAddress)) {
        throw new Error(`[Deploy Error] Invalid admin address: "${adminAddress}"`);
    }
    if (!activeHre.ethers.isAddress(relayerAddress)) {
        throw new Error(`[Deploy Error] Invalid relayer address: "${relayerAddress}"`);
    }
    // Guard 4: Zero-address rejection
    const ZERO_ADDRESS = activeHre.ethers.ZeroAddress || "0x0000000000000000000000000000000000000000";
    if (adminAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
        throw new Error(`[Deploy Error] Address validation failure: Admin role cannot be assigned to zero address.`);
    }
    if (relayerAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
        throw new Error(`[Deploy Error] Address validation failure: Relayer role cannot be assigned to zero address.`);
    }
    // Guard 5: Reject known local development accounts on public networks
    if (!isLocal) {
        if (exports.KNOWN_DEV_ACCOUNTS.has(deployer.address.toLowerCase())) {
            throw new Error(`[Deploy Error] Security violation: Deployer account (${deployer.address}) is a known local development account, prohibited on public networks.`);
        }
        if (exports.KNOWN_DEV_ACCOUNTS.has(adminAddress.toLowerCase())) {
            throw new Error(`[Deploy Error] Security violation: Admin address (${adminAddress}) is a known local development account, prohibited on public networks.`);
        }
        if (exports.KNOWN_DEV_ACCOUNTS.has(relayerAddress.toLowerCase())) {
            throw new Error(`[Deploy Error] Security violation: Relayer address (${relayerAddress}) is a known local development account, prohibited on public networks.`);
        }
        // Guard 6: Role separation enforcement
        if (adminAddress.toLowerCase() === relayerAddress.toLowerCase()) {
            throw new Error(`[Deploy Error] Role conflict: Admin address and Relayer address must be distinct on public networks. Reusing the admin address as the relayer violates operational role separation.`);
        }
        if (deployer.address.toLowerCase() === relayerAddress.toLowerCase()) {
            throw new Error(`[Deploy Error] Role conflict: Deployer account cannot be designated as the operational relayer on public networks.`);
        }
        if (deployer.address.toLowerCase() === adminAddress.toLowerCase()) {
            throw new Error(`[Deploy Error] Role conflict: Deployer account cannot be designated as the permanent admin on public networks. Handover requires a distinct admin target.`);
        }
    }
    console.log(`Target Admin Role:   ${adminAddress}`);
    console.log(`Target Relayer Role: ${relayerAddress}`);
    // Pre-flight contract factory and transaction data
    const PredictionProvenanceFactory = await activeHre.ethers.getContractFactory("PredictionProvenance");
    let bytecodeBytes = 0;
    if (typeof PredictionProvenanceFactory.getDeployTransaction === "function") {
        const deployTx = await PredictionProvenanceFactory.getDeployTransaction();
        if (deployTx && deployTx.data) {
            bytecodeBytes = (deployTx.data.length - 2) / 2;
            console.log(`Compiled Bytecode Verified: ${bytecodeBytes} bytes (ABI and factory validated)`);
        }
    }
    // Guard 7: Fail-safe deployment authorization gate
    if (!isLocal) {
        const isConfirmed = process.env.DEPLOY_CONFIRM === "true";
        if (!isConfirmed) {
            console.log(`------------------------------------------------------------------`);
            console.log(`DRY-RUN READINESS CHECK COMPLETED SUCCESSFULLY.`);
            console.log(`Contract bytecode, compiler configuration, and role targets verified.`);
            console.log(`DEPLOYMENT HALTED: Testnet transaction broadcasting is NOT authorized.`);
            console.log(`To execute live deployment in a separately authorized milestone, set DEPLOY_CONFIRM=true.`);
            console.log(`==================================================================`);
            return {
                status: "DRY_RUN_HALTED",
                chainId,
                networkName,
                deployer: deployer.address,
                admin: adminAddress,
                relayer: relayerAddress,
                bytecodeBytes,
            };
        }
    }
    console.log(`------------------------------------------------------------------`);
    console.log(`Broadcasting PredictionProvenance deployment transaction...`);
    const provenance = await PredictionProvenanceFactory.deploy();
    await provenance.waitForDeployment();
    const contractAddress = await provenance.getAddress();
    console.log(`PredictionProvenance successfully deployed to: ${contractAddress}`);
    // Obtain role hashes from contract
    const DEFAULT_ADMIN_ROLE = await provenance.DEFAULT_ADMIN_ROLE();
    const WRITER_ROLE = await provenance.WRITER_ROLE();
    const PAUSER_ROLE = await provenance.PAUSER_ROLE();
    // Role Assignment Sequence:
    // Step 1: Grant WRITER_ROLE to operational relayer
    console.log(`Assigning WRITER_ROLE to relayer: ${relayerAddress}...`);
    const txWriter = await provenance.grantRole(WRITER_ROLE, relayerAddress);
    await txWriter.wait();
    // Step 2: Grant DEFAULT_ADMIN_ROLE to administrator
    console.log(`Assigning DEFAULT_ADMIN_ROLE to admin: ${adminAddress}...`);
    const txAdmin = await provenance.grantRole(DEFAULT_ADMIN_ROLE, adminAddress);
    await txAdmin.wait();
    // Step 3: Grant PAUSER_ROLE to administrator
    console.log(`Assigning PAUSER_ROLE to admin: ${adminAddress}...`);
    const txPauser = await provenance.grantRole(PAUSER_ROLE, adminAddress);
    await txPauser.wait();
    // Step 4: Verify initial role grants
    const hasWriter = await provenance.hasRole(WRITER_ROLE, relayerAddress);
    const hasAdmin = await provenance.hasRole(DEFAULT_ADMIN_ROLE, adminAddress);
    const hasPauser = await provenance.hasRole(PAUSER_ROLE, adminAddress);
    if (!hasWriter || !hasAdmin || !hasPauser) {
        throw new Error(`[Deploy Error] Post-deployment role verification failed: required role not active on-chain ` +
            `(writer=${hasWriter}, admin=${hasAdmin}, pauser=${hasPauser}).`);
    }
    // Step 5: Administrative Handover (Deployer renounces privileges if not identical to admin)
    if (deployer.address.toLowerCase() !== adminAddress.toLowerCase()) {
        console.log(`Executing administrative handover: Deployer (${deployer.address}) renouncing roles...`);
        // Renounce operational writer role from deployer
        const txRenounceWriter = await provenance.renounceRole(WRITER_ROLE, deployer.address);
        await txRenounceWriter.wait();
        // Renounce emergency pauser role from deployer
        const txRenouncePauser = await provenance.renounceRole(PAUSER_ROLE, deployer.address);
        await txRenouncePauser.wait();
        // Renounce administrative role from deployer
        const txRenounceAdmin = await provenance.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
        await txRenounceAdmin.wait();
        // Verify deployer privileges are completely removed
        const deployerHasAdmin = await provenance.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
        const deployerHasWriter = await provenance.hasRole(WRITER_ROLE, deployer.address);
        const deployerHasPauser = await provenance.hasRole(PAUSER_ROLE, deployer.address);
        const adminStillHasAdmin = await provenance.hasRole(DEFAULT_ADMIN_ROLE, adminAddress);
        if (deployerHasAdmin || deployerHasWriter || deployerHasPauser || !adminStillHasAdmin) {
            throw new Error(`[Deploy Error] Administrative handover verification failed: deployer retains privileged roles or administrator lost admin role.`);
        }
        console.log(`Administrative handover successfully verified. Deployer holds zero privileged roles.`);
    }
    // Step 6: Network-isolated contract address persistence
    // A. Save to services/blockchain/deployment-info.json
    const deployInfoPath = path_1.default.join(__dirname, "../deployment-info.json");
    let deployInfoData = {};
    if (fs_1.default.existsSync(deployInfoPath)) {
        try {
            deployInfoData = JSON.parse(fs_1.default.readFileSync(deployInfoPath, "utf8"));
        }
        catch {
            deployInfoData = {};
        }
    }
    // Isolate by chain ID
    deployInfoData[String(chainId)] = {
        network: networkName,
        chainId,
        provenanceAddress: contractAddress,
        admin: adminAddress,
        relayer: relayerAddress,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
    };
    // Preserve root keys for backward-compatibility only if running locally
    if (isLocal) {
        deployInfoData.provenanceAddress = contractAddress;
        deployInfoData.deployer = deployer.address;
        deployInfoData.network = networkName;
        deployInfoData.timestamp = new Date().toISOString();
    }
    const tmpDeployInfo = deployInfoPath + ".tmp";
    fs_1.default.writeFileSync(tmpDeployInfo, JSON.stringify(deployInfoData, null, 2));
    fs_1.default.renameSync(tmpDeployInfo, deployInfoPath);
    console.log(`Updated network deployment info saved to ${deployInfoPath}`);
    // B. Also update blockchain/contract-address.json if present
    const contractAddressPath = path_1.default.join(__dirname, "../../../blockchain/contract-address.json");
    if (fs_1.default.existsSync(contractAddressPath)) {
        try {
            const regData = JSON.parse(fs_1.default.readFileSync(contractAddressPath, "utf8"));
            regData[String(chainId)] = {
                ...(regData[String(chainId)] || {}),
                network: networkName,
                chainId,
                PredictionProvenance: contractAddress,
                provenanceAdmin: adminAddress,
                provenanceRelayer: relayerAddress,
            };
            if (isLocal) {
                regData.PredictionProvenance = contractAddress;
            }
            const tmpReg = contractAddressPath + ".tmp";
            fs_1.default.writeFileSync(tmpReg, JSON.stringify(regData, null, 2));
            fs_1.default.renameSync(tmpReg, contractAddressPath);
            console.log(`Updated multi-chain address registry saved to ${contractAddressPath}`);
        }
        catch (e) {
            console.warn(`[Deploy Warning] Could not update blockchain/contract-address.json:`, e);
        }
    }
    console.log(`==================================================================`);
    return {
        status: "DEPLOYED",
        address: contractAddress,
        chainId,
        networkName,
        deployer: deployer.address,
        admin: adminAddress,
        relayer: relayerAddress,
        bytecodeBytes,
    };
}
async function main() {
    return await runProvenanceDeployment();
}
if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
//# sourceMappingURL=deploy-provenance.js.map