import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-verify";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from 'dotenv';
import { getNetworkAccountsConfig } from "./constants/network";
import './tasks/deployContracts';
require('hardhat-contract-sizer');

// load env vars
dotenv.config();

const config: HardhatUserConfig = {
    solidity: {
      version: "0.8.24",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
        viaIR: true
      }
    },
    contractSizer: {
      alphaSort: true,
      runOnCompile: true,
      disambiguatePaths: false,
    },
    // public LUKSO Testnet
    networks: {
      // luksoTestnet: {
      //   url: "https://lukso-testnet.rpc.thirdweb.com",
      //   chainId: 4201,
      //   accounts: [ getNetworkAccountsConfig("luksoTestnet").EOA_PRIVATE_KEY as string] // your private key here
      // },
      // luksoMain: {
      //   url: "https://lukso.rpc.thirdweb.com",
      //   chainId: 42,
      //   accounts: [getNetworkAccountsConfig("luksoMain").EOA_PRIVATE_KEY as string] // your private key here
      // },
    },
    sourcify: {
      enabled: false,
    },

    etherscan: {
      apiKey: {
        luksoTestnet: "no-api-key-needed",
        luksoMain: "no-api-key-needed",
      },
      customChains: [
        {
          network: "luksoTestnet",
          chainId: 4201,
          urls: {
            apiURL: "https://api.explorer.execution.testnet.lukso.network/api",
            browserURL: "https://explorer.execution.testnet.lukso.network",
          },
        },
        {
          network: "luksoMain",
          chainId: 42,
          urls: {
            apiURL: "https://api.explorer.execution.mainnet.lukso.network/api",
            browserURL: "https://explorer.execution.mainnet.lukso.network",
          },
        },
      ],
    },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    external: "./node_modules/[npm-package]/contracts"
  },
  };
  
  export default config;