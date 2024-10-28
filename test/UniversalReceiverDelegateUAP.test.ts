import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, Signer } from "ethers";
import { LSP1_TYPE_IDS } from "@lukso/lsp-smart-contracts";

// Import the artifacts (assumed to be compiled and available)
import { UniversalReceiverDelegateUAP } from "../typechain-types";
import { MockLSP0 } from "../typechain-types";
import { MockAssistant } from "../typechain-types";
import { MockScreenerAssistant } from "../typechain-types";
import { MockERC725Y } from "../typechain-types";

describe.skip("UniversalReceiverDelegateUAP", function () {
  let owner: Signer;
  let nonOwner: Signer;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let universalReceiverDelegateUAPAddress: string;
  let mockLSP0: MockLSP0;
  let mockAssistant: MockAssistant;
  let mockScreenerAssistant: MockScreenerAssistant;
  let mockERC725Y: MockERC725Y;

  const INTERFACEID_LSP0 = "0x3c54a2a1"; // Interface ID for LSP0ERC725Account

  beforeEach(async function () {
    [owner, nonOwner] = await ethers.getSigners();

    // Deploy the UniversalReceiverDelegateUAP contract
    const UniversalReceiverDelegateUAPFactory = await ethers.getContractFactory(
      "UniversalReceiverDelegateUAP"
    );
    universalReceiverDelegateUAP = (await UniversalReceiverDelegateUAPFactory.deploy()) as UniversalReceiverDelegateUAP;
    await universalReceiverDelegateUAP.waitForDeployment();
    universalReceiverDelegateUAPAddress = await universalReceiverDelegateUAP.getAddress();

    // Deploy a mock LSP0 contract
    const MockLSP0Factory = await ethers.getContractFactory("MockLSP0");
    mockLSP0 = (await MockLSP0Factory.deploy()) as MockLSP0;
    await mockLSP0.waitForDeployment();

    // Deploy a mock ERC725Y contract
    const MockERC725YFactory = await ethers.getContractFactory("MockERC725Y");
    mockERC725Y = (await MockERC725YFactory.deploy()) as MockERC725Y;
    await mockERC725Y.waitForDeployment();
    const mockERC725YAddress = await mockERC725Y.getAddress();

    // Set the ERC725Y instance in the mock LSP0 contract
    await mockLSP0.setERC725Y(mockERC725YAddress);

    // Deploy mock assistant contracts
    const MockAssistantFactory = await ethers.getContractFactory("MockAssistant");
    mockAssistant = (await MockAssistantFactory.deploy()) as MockAssistant;

    const MockScreenerAssistantFactory = await ethers.getContractFactory("MockScreenerAssistant");
    mockScreenerAssistant = (await MockScreenerAssistantFactory.deploy()) as MockScreenerAssistant;
  });

  describe("universalReceiverDelegate", function () {
/*

    it("should correctly decode addresses in customDecodeAddresses function", async function () {
      const addresses = [
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
      ];
      const numAddresses = ethers.utils.hexZeroPad(ethers.utils.hexlify(addresses.length), 2);
      const encodedAddresses = addresses.map((addr) =>
        ethers.utils.hexZeroPad(addr, 20)
      );
      const encodedData = ethers.utils.hexConcat([numAddresses, ...encodedAddresses]);

      const decodedAddresses = await universalReceiverDelegateUAP.customDecodeAddresses(
        encodedData
      );

      expect(decodedAddresses[0]).to.equal(addresses[0]);
      expect(decodedAddresses[1]).to.equal(addresses[1]);
    });
    */
  });
});
