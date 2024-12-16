import { Network } from "./networkInterface";

const NETWORKS = {
  luksoMain: {
      EOA_PRIVATE_KEY: process.env.LUKSO_MAINNET_EOA_PRIVATE_KEY || "",
      EOA_PUBLIC_KEY: process.env.LUKSO_MAINNET_EOA_PUBLIC_KEY || "",
      UP_ADDR_CONTROLLED_BY_EOA: process.env.LUKSO_MAINNET_UP_ADDR_CONTROLLED_BY_EOA || "",
  },
  luksoTestnet: {
    EOA_PRIVATE_KEY: process.env.LUKSO_TESTNET_EOA_PRIVATE_KEY || "",
    EOA_PUBLIC_KEY: process.env.LUKSO_TESTNET_EOA_PUBLIC_KEY || "",
    UP_ADDR_CONTROLLED_BY_EOA: process.env.LUKSO_TESTNET_UP_ADDR_CONTROLLED_BY_EOA || "",
  },
} as {
  [key: string]: Network;
};

export const getNetworkAccountsConfig = (name: string) => {
  switch (name) {
    case 'luksoMain':
      return NETWORKS.luksoMain;
    case 'luksoTestnet':
      return NETWORKS.luksoTestnet;
    default:
      throw new Error(`Unknown network ${name}`);
  }
};