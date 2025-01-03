import { Network } from "./networkInterface";

export const getNetworkAccountsConfig = (name: string) => {
  switch (name) {
    case 'luksoMain':
      return {
        EOA_PRIVATE_KEY: process.env.LUKSO_MAINNET_EOA_PRIVATE_KEY || "",
        EOA_PUBLIC_KEY: process.env.LUKSO_MAINNET_EOA_PUBLIC_KEY || "",
        UP_ADDR_CONTROLLED_BY_EOA: process.env.LUKSO_MAINNET_UP_ADDR_CONTROLLED_BY_EOA || "",
      };
    case 'luksoTestnet':
      return {
        EOA_PRIVATE_KEY: process.env.LUKSO_TESTNET_EOA_PRIVATE_KEY || "",
        EOA_PUBLIC_KEY: process.env.LUKSO_TESTNET_EOA_PUBLIC_KEY || "",
        UP_ADDR_CONTROLLED_BY_EOA: process.env.LUKSO_TESTNET_UP_ADDR_CONTROLLED_BY_EOA || "",
      };
    default:
      throw new Error(`Unknown network ${name}`);
  }
};