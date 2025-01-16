const { ethers } = require("ethers");

// Replace these values with your actual contract address and ABI
const ASSISTANT_CONTRACT_ADDRESS = "0xYourAssistantContractAddress";
const ASSISTANT_ABI = [
  "event BurnPixAssitantUsageLogged(address indexed up)"
];

// 1. Connect to a node (could be mainnet, testnet, local)
const provider = new ethers.providers.JsonRpcProvider("https://rpc.l16.lukso.network");
// or e.g., "https://rpc.ankr.com/eth", depending on chain

// 2. Create a contract instance
const assistantContract = new ethers.Contract(
  ASSISTANT_CONTRACT_ADDRESS,
  ASSISTANT_ABI,
  provider
);

async function main() {
  // 3. Query all past UsageLogged events
  // (You can optionally specify a range: e.g., fromBlock, toBlock)
  const events = await assistantContract.queryFilter("UsageLogged");

  // 4. Extract the addresses from each event and track them in a Set (for uniqueness)
  const uniqueUsers = new Set();
  for (const ev of events) {
    const upAddress = ev.args.up; // usageLogs(address indexed up)
    uniqueUsers.add(upAddress);
  }

  // 5. Now you have the total unique count
  console.log("Number of unique UPs:", uniqueUsers.size);

  // If you want, print them all
  console.log("List of unique addresses:", [...uniqueUsers]);
}

main().catch(console.error);
