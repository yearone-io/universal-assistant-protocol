import hre, { ethers } from "hardhat";
import { getNetworkAccountsConfig } from "../constants/network";

const network = hre.network.name;
console.log("network: ", network);
const { UP_ADDR_CONTROLLED_BY_EOA, protocolFeeAddress } = getNetworkAccountsConfig(
  network as string,
);

async function main() {
  /*
  const LSP2Utils = await ethers.getContractFactory('@lukso/lsp-smart-contracts/contracts/LSP2ERC725YJSONSchema/LSP2Utils.sol:LSP2Utils');
  const LSP2UtilsLibrary = await LSP2Utils.deploy();
  await LSP2UtilsLibrary.waitForDeployment();
  console.log('✅ LSP2UtilsLibrary deployed to:', LSP2UtilsLibrary.target);

  try {
    await hre.run("verify:verify", {
      address: LSP2UtilsLibrary.target,
      network,
      constructorArguments: [],
      contract: "@lukso/lsp-smart-contracts/contracts/LSP2ERC725YJSONSchema/LSP2Utils.sol:LSP2Utils"
    });
    console.log("Contract verified");

  } catch (error) {
    console.error("Contract verification failed:", error);
  }
  */
  const deployer = UP_ADDR_CONTROLLED_BY_EOA;
  console.log("Deploying contracts with the account:", deployer);
  const UniversalReceiverDelegateUAP = await ethers.getContractFactory(
    "UniversalReceiverDelegateUAP",
    {
      /*
    libraries: {
      LSP2Utils: LSP2UtilsLibrary.target,
    },
    */
    },
  );
  const universalReceiverDelegateUAP =
    await UniversalReceiverDelegateUAP.deploy();
  // wait until the contract is mined
  await universalReceiverDelegateUAP.waitForDeployment();

  // print contract address
  const address = await universalReceiverDelegateUAP.getAddress();
  console.log("✅ UniversalReceiverDelegateUAP deployed to:", address);

  try {
    await hre.run("verify:verify", {
      address: universalReceiverDelegateUAP.target,
      network,
      constructorArguments: [protocolFeeAddress],
      contract:
        "contracts/UniversalReceiverDelegateUAP.sol:UniversalReceiverDelegateUAP",
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
