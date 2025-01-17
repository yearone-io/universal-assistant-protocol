const { ethers } = require("ethers");

// Replace with your own values
const RPC_URL = "https://rpc.l16.lukso.network"; // or another network RPC
const URD_CONTRACT_ADDRESS = "0xYourDeployedURDContract";
const URD_ABI = [
  "event AssistantInvoked(address indexed subscriber, address indexed executiveAssistant)"
];

async function main() {
  // 1) Connect to network
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  // 2) Create contract instance
  const urdContract = new ethers.Contract(URD_CONTRACT_ADDRESS, URD_ABI, provider);

  // 3) Query all "URDCalled" events from block 0 to latest
  const filter = urdContract.filters.URDCalled();
  const events = await urdContract.queryFilter(filter, 0, "latest");

  // 4) Gather unique addresses or do other analytics
  const uniqueUPs = new Set();
  for (const ev of events) {
    const up = ev.args.up;
    uniqueUPs.add(up);
  }

  console.log("Total events:", events.length);
  console.log("Unique UPs that used the URD:", uniqueUPs.size);
}

main().catch(console.error);
