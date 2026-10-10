import "@nomicfoundation/hardhat-toolbox";
import { HardhatUserConfig } from "hardhat/config";

import * as dotenv from "dotenv";
import * as path from "path";

// Load workspace root .env with fallback to local .env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    mumbai: {
      url: process.env.POLYGON_RPC_URL || "https://rpc-mumbai.maticvigil.com",
      accounts: process.env.AMOY_DEPLOYER_PRIVATE_KEY 
        ? [process.env.AMOY_DEPLOYER_PRIVATE_KEY] 
        : [],
      chainId: 80001,
    },
    amoy: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com",
      accounts: process.env.AMOY_DEPLOYER_PRIVATE_KEY 
        ? [process.env.AMOY_DEPLOYER_PRIVATE_KEY] 
        : [],
      chainId: 80002,
    },
  },
  etherscan: {
    apiKey: {
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com",
        },
      },
    ],
  },
};

export default config;
