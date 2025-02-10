import hre, { ethers } from "hardhat";
import { getNetworkAccountsConfig } from "../constants/network";

const network = hre.network.name;
console.log("network: ", network);
const { UP_ADDR_CONTROLLED_BY_EOA } = getNetworkAccountsConfig(
  network as string,
);

async function main() {
  const deployer = UP_ADDR_CONTROLLED_BY_EOA;
  console.log("Deploying contracts with the account:", deployer);
  const AssistantContract = await ethers.getContractFactory(
    "TipAssistant",
    {},
  );
  const assistantContract = await AssistantContract.deploy();
  // wait until the contract is mined
  await assistantContract.waitForDeployment();

  // print contract address
  const address = await assistantContract.getAddress();
  console.log("✅ TipAssistant deployed to:", address);

  try {
    await hre.run("verify:verify", {
      address: assistantContract.target,
      network,
      constructorArguments: [],
      contract:
        "contracts/executive-assistants/TipAssistant.sol:TipAssistant",
    });
    console.log("Contract verified");
  } catch (error) {
    console.error("Contract verification failed:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
