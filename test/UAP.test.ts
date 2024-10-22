import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { LSP1_TYPE_IDS } from "@lukso/lsp-smart-contracts";

// Import the artifacts (assumed to be compiled and available)
import { UniversalReceiverDelegateUAP } from "../typechain-types";
import { MockLSP0 } from "../typechain-types";
import { MockAssistant } from "../typechain-types";
import { MockScreenerAssistant } from "../typechain-types";
import { MockERC725Y } from "../typechain-types";

describe("UniversalReceiverDelegateUAP", function () {
  let owner: Signer;
  let nonOwner: Signer;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let universalReceiverDelegateUAPAddress: string;
  let mockLSP0: MockLSP0;
  let mockAssistant: MockAssistant;
  let mockScreenerAssistant: MockScreenerAssistant;
  let mockERC725Y: MockERC725Y;

  beforeEach(async function () {
    [owner, nonOwner] = await ethers.getSigners();

    // Deploy UniversalReceiverDelegateUAP
    const UniversalReceiverDelegateUAPFactory = await ethers.getContractFactory(
      "UniversalReceiverDelegateUAP"
    );
    universalReceiverDelegateUAP = (await UniversalReceiverDelegateUAPFactory.deploy()) as UniversalReceiverDelegateUAP;
    await universalReceiverDelegateUAP.waitForDeployment();
    universalReceiverDelegateUAPAddress = await universalReceiverDelegateUAP.getAddress();

    // Deploy mock LSP0
    const MockLSP0Factory = await ethers.getContractFactory("MockLSP0");
    mockLSP0 = (await MockLSP0Factory.deploy()) as MockLSP0;
    await mockLSP0.waitForDeployment();
    const mockLSP0Address = await mockLSP0.getAddress();

    // Deploy mock ERC725Y (storage)
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
    it("should revert if caller is not an LSP0", async function () {
      await expect(
        universalReceiverDelegateUAP
          .connect(nonOwner)
          .universalReceiverDelegate(
            await owner.getAddress(),
            0,
            LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification,
            "0x"
          )
      ).to.be.revertedWith("UniversalReceiverDelegateUAP: Caller is not an LSP0");
    });

    it("should proceed with super function if no type configuration is found", async function () {
      // Mock getData to return empty bytes
      // await mockERC725Y.setData("", "");
      // console.log("mockERC725Y.address", mockERC725Y.address);
      await expect(
        mockLSP0.callUniversalReceiverDelegate(
          universalReceiverDelegateUAPAddress,
          await owner.getAddress(),
          0,
          LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification,
          "0x"
        )
      ).to.not.be.reverted;
    });
  });
});
