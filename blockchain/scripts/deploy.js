let hre;
try {
  hre = require("hardhat");
} catch (e) {
  // Allow importing runDeployment in external tests with mock HRE
}
const fs = require("fs");
const path = require("path");

/**
 * Well-known default development accounts generated from standard Hardhat test mnemonic:
 * "test test test test test test test test test test test junk".
 * Strictly prohibited on public testnets or production networks.
 */
const KNOWN_DEV_ACCOUNTS = new Set([
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
 * Executes or preflights the AgroTraceRegistry smart contract deployment.
 * @param {object} hreInstance Hardhat runtime environment instance
 * @returns {Promise<{ status: string, address?: string, chainId: number, networkName: string }>}
 */
async function runDeployment(hreInstance = hre) {
  const activeHre = hreInstance || hre;
  if (!activeHre || !activeHre.ethers || !activeHre.ethers.provider) {
    throw new Error("[Deploy Error] Hardhat runtime environment not initialized.");
  }
  const network = await activeHre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const configuredNetworkName = (activeHre.network && activeHre.network.name ? activeHre.network.name : "").toLowerCase();
  const isLocal = chainId === 31337 || chainId === 1337 || configuredNetworkName === "localhost" || configuredNetworkName === "hardhat";
  const isAmoy = chainId === 80002 || configuredNetworkName === "amoy";

  // Guard B1: Disallow mainnet deployment paths unconditionally
  if (chainId === 1 || chainId === 137 || configuredNetworkName === "mainnet" || configuredNetworkName === "polygon") {
    throw new Error(`[Deploy Error] Security violation: Mainnet deployment (chain ID ${chainId}) is strictly prohibited.`);
  }

  // Guard B2: Enforce network and chain ID alignment
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
  console.log(`AgroTraceRegistry Deployment Tooling`);
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
    adminAddress = process.env.LOCAL_ADMIN_ADDRESS || deployer.address;
    relayerAddress = process.env.LOCAL_RELAYER_ADDRESS || deployer.address;
  } else {
    adminAddress = process.env.AMOY_ADMIN_ADDRESS || deployer.address;
    relayerAddress = process.env.AMOY_RELAYER_ADDRESS;

    if (!relayerAddress) {
      throw new Error(
        `[Deploy Error] AMOY_RELAYER_ADDRESS is required for public network deployment. ` +
        `Using the deployment account as the operational relayer on public testnets is prohibited without explicit configuration.`
      );
    }
  }

  // Guard C1: Validate address formatting
  if (!activeHre.ethers.isAddress(adminAddress)) {
    throw new Error(`[Deploy Error] Invalid admin address: "${adminAddress}"`);
  }
  if (!activeHre.ethers.isAddress(relayerAddress)) {
    throw new Error(`[Deploy Error] Invalid relayer address: "${relayerAddress}"`);
  }

  // Guard C2: Zero-address rejection
  if (adminAddress === activeHre.ethers.ZeroAddress || adminAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error(`[Deploy Error] Address validation failure: Admin role cannot be assigned to zero address.`);
  }
  if (relayerAddress === activeHre.ethers.ZeroAddress || relayerAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error(`[Deploy Error] Address validation failure: Relayer role cannot be assigned to zero address.`);
  }

  // Guard C3: Reject known local development accounts on public networks
  if (!isLocal) {
    if (KNOWN_DEV_ACCOUNTS.has(deployer.address.toLowerCase())) {
      throw new Error(`[Deploy Error] Security violation: Deployer account (${deployer.address}) is a known local development account, prohibited on public networks.`);
    }
    if (KNOWN_DEV_ACCOUNTS.has(adminAddress.toLowerCase())) {
      throw new Error(`[Deploy Error] Security violation: Admin address (${adminAddress}) is a known local development account, prohibited on public networks.`);
    }
    if (KNOWN_DEV_ACCOUNTS.has(relayerAddress.toLowerCase())) {
      throw new Error(`[Deploy Error] Security violation: Relayer address (${relayerAddress}) is a known local development account, prohibited on public networks.`);
    }

    // Guard C4: Role separation enforcement
    if (adminAddress.toLowerCase() === relayerAddress.toLowerCase()) {
      throw new Error(`[Deploy Error] Role conflict: Admin address and Relayer address must be distinct on public networks. Reusing the admin address as the relayer violates operational role separation.`);
    }
    if (deployer.address.toLowerCase() === relayerAddress.toLowerCase()) {
      throw new Error(`[Deploy Error] Role conflict: Deployer account cannot be designated as the operational relayer on public networks.`);
    }
  }

  console.log(`Target Admin Role:   ${adminAddress}`);
  console.log(`Target Relayer Role: ${relayerAddress}`);

  // Pre-flight contract factory and deployment transaction encoding validation
  const AgroTraceRegistry = await activeHre.ethers.getContractFactory("AgroTraceRegistry");
  const deployTx = await AgroTraceRegistry.getDeployTransaction(adminAddress, relayerAddress);
  const bytecodeBytes = (deployTx.data.length - 2) / 2;
  console.log(`Compiled Bytecode Verified: ${bytecodeBytes} bytes (ABI and constructor arguments validated)`);

  // CRITICAL FAIL-SAFE DEPLOYMENT AUTHORIZATION GUARD:
  if (!isLocal) {
    const isConfirmed = process.env.DEPLOY_CONFIRM === "true";
    if (!isConfirmed) {
      console.log(`------------------------------------------------------------------`);
      console.log(`DRY-RUN READINESS CHECK COMPLETED SUCCESSFULLY.`);
      console.log(`Contract bytecode, compiler configuration, and role targets verified.`);
      console.log(`DEPLOYMENT HALTED: Testnet transaction broadcasting is NOT authorized.`);
      console.log(`To execute live deployment in a separately authorized milestone, set DEPLOY_CONFIRM=true.`);
      console.log(`==================================================================`);
      return { status: "DRY_RUN_HALTED", chainId, networkName, bytecodeBytes };
    }
  }

  console.log(`------------------------------------------------------------------`);
  console.log(`Broadcasting AgroTraceRegistry deployment transaction...`);
  const registry = await AgroTraceRegistry.deploy(adminAddress, relayerAddress);

  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log(`AgroTraceRegistry successfully deployed to: ${address}`);

  // Save network-scoped address to contract-address.json
  const addressFile = path.join(__dirname, "..", "contract-address.json");
  let addressData = {};

  if (fs.existsSync(addressFile)) {
    try {
      addressData = JSON.parse(fs.readFileSync(addressFile, "utf8"));
    } catch (e) {
      addressData = {};
    }
  }

  // Network-keyed section
  addressData[String(chainId)] = {
    network: networkName,
    chainId: chainId,
    AgroTraceRegistry: address,
    admin: adminAddress,
    relayer: relayerAddress,
    deployedAt: new Date().toISOString(),
  };

  // Preserve root keys for local test backwards-compatibility only if local
  if (isLocal) {
    addressData.AgroTraceRegistry = address;
    addressData.Traceability = address;
  }

  const tempFile = addressFile + ".tmp";
  fs.writeFileSync(tempFile, JSON.stringify(addressData, null, 2));
  fs.renameSync(tempFile, addressFile);
  console.log(`Updated network configuration saved to ${addressFile}`);
  console.log(`==================================================================`);

  return { status: "DEPLOYED", address, chainId, networkName };
}

async function main() {
  return await runDeployment(hre);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  runDeployment,
  KNOWN_DEV_ACCOUNTS
};
