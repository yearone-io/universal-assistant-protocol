import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { LSP1_TYPE_IDS, PERMISSIONS } from "@lukso/lsp-smart-contracts";
import {
  ForwarderAssistant,
  MockAssistant,
  MockBadAssistant,
  MockBadScreenerAssistant,
  MockFalseScreenerAssistant,
  MockLSP8IdentifiableDigitalAsset,
  MockTrueScreenerAssistant,
  UniversalReceiverDelegateUAP,
} from "../typechain-types";
import {
  grantBrowserExtensionUrdSetPermissions,
  setLSP1UniversalReceiverDelegate,
  setupProfileWithKeyManagerWithURD,
} from "./up-utils";
import { MockLSP7DigitalAsset } from "../typechain-types/contracts/mocks";
import { customEncodeAddresses } from "./helpers/encoding";

describe("UniversalReceiverDelegateUAP", function () {
  let owner: Signer;
  let browserController: Signer;
  let nonOwner: Signer;
  let LSP7Holder: Signer;
  let LSP8Holder: Signer;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let mockAssistant: MockAssistant;
  let mockAssistantAddress: string;
  let mockBadAssistant: MockAssistant;
  let mockBadAssistantAddress: string;
  let mockTrueScreenerAssistant: MockTrueScreenerAssistant;
  let mockTrueScreenerAssistantAddress: string;
  let mockFalseScreenerAssistant: MockTrueScreenerAssistant;
  let mockFalseScreenerAssistantAddress: string;
  let mockBadScreenerAssistant: MockTrueScreenerAssistant;
  let mockBadScreenerAssistantAddress: string;
  let typeMappingKey: string;
  let forwarderAssistant: ForwarderAssistant;
  let forwarderAssistantAddress: string;
  let mockLSP7: MockLSP7DigitalAsset;
  let mockLSP8: MockLSP8IdentifiableDigitalAsset;
  let mockLSP8Address: string;
  let mockUP: any;
  let mockUPAddress: string;

  beforeEach(async function () {
    [owner, browserController, nonOwner, LSP7Holder, LSP8Holder] = await ethers.getSigners();

    // Deploy UP account and URDUAP
    const [universalProfile,,lsp1universalReceiverDelegateUP] = await setupProfileWithKeyManagerWithURD(owner, browserController);
    await grantBrowserExtensionUrdSetPermissions(owner, browserController, universalProfile);
    [universalReceiverDelegateUAP] = await setLSP1UniversalReceiverDelegate(
      browserController,
      universalProfile,
      [PERMISSIONS.SUPER_CALL],
    );

    mockUP = universalProfile;
    mockUPAddress = await universalProfile.getAddress();

    // Deploy mock assistant contracts
    const MockAssistantFactory = await ethers.getContractFactory("MockAssistant");
    mockAssistant = (await MockAssistantFactory.deploy()) as MockAssistant;
    mockAssistantAddress = await mockAssistant.getAddress();

    const MockBadAssistantFactory = await ethers.getContractFactory("MockBadAssistant");
    mockBadAssistant = (await MockBadAssistantFactory.deploy()) as MockBadAssistant;
    mockBadAssistantAddress = await mockBadAssistant.getAddress();

    const ForwarderAssistantFactory = await ethers.getContractFactory("ForwarderAssistant");
    forwarderAssistant = (await ForwarderAssistantFactory.deploy()) as ForwarderAssistant;
    await forwarderAssistant.waitForDeployment();
    forwarderAssistantAddress = await forwarderAssistant.getAddress();

    const MockLSP7Factory = await ethers.getContractFactory("MockLSP7DigitalAsset");
    mockLSP7 = (await MockLSP7Factory.deploy(
      "Mock LSP7 Token",
      "MLSP7",
      await LSP7Holder.getAddress(),
    )) as MockLSP7DigitalAsset;
    await mockLSP7.waitForDeployment();

    const MockLSP8Factory = await ethers.getContractFactory("MockLSP8IdentifiableDigitalAsset");
    mockLSP8 = (await MockLSP8Factory.deploy(
      "Mock LSP8 Token",
      "MLSP8",
      await LSP8Holder.getAddress(),
    )) as MockLSP8IdentifiableDigitalAsset;
    await mockLSP8.waitForDeployment();
    mockLSP8Address = await mockLSP8.getAddress();

    const MockTrueScreenerAssistantFactory = await ethers.getContractFactory("MockTrueScreenerAssistant");
    mockTrueScreenerAssistant =
      (await MockTrueScreenerAssistantFactory.deploy()) as MockTrueScreenerAssistant;
    mockTrueScreenerAssistantAddress = await mockTrueScreenerAssistant.getAddress();

    const MockFalseScreenerAssistantFactory = await ethers.getContractFactory("MockFalseScreenerAssistant");
    mockFalseScreenerAssistant =
      (await MockFalseScreenerAssistantFactory.deploy()) as MockFalseScreenerAssistant;
    mockFalseScreenerAssistantAddress = await mockFalseScreenerAssistant.getAddress();

    const MockBadScreenerAssistantFactory = await ethers.getContractFactory("MockBadScreenerAssistant");
    mockBadScreenerAssistant =
      (await MockBadScreenerAssistantFactory.deploy()) as MockBadScreenerAssistant;
    mockBadScreenerAssistantAddress = await mockBadScreenerAssistant.getAddress();

    typeMappingKey = generateMappingKey("UAPTypeConfig", LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification);
  });

  describe("universalReceiverDelegate", function () {
    it("should proceed with super function if no type configuration is found", async function () {
      const amount = 1;
      await mockLSP7.connect(LSP7Holder).mint(LSP7Holder, amount);
      await mockLSP7
        .connect(LSP7Holder)
        .transfer(await LSP7Holder.getAddress(), mockUPAddress, amount, true, "0x");

      const balanceOfUp = await mockLSP7.balanceOf(mockUPAddress);
      expect(balanceOfUp).to.equal(amount);
    });

    it("should proceed with super function if type configuration is found but no assistants are found", async function () {
      // Mock getData to return data that decodes to an empty array
      const encodedData = customEncodeAddresses([]);
      await mockUP.setData(typeMappingKey, encodedData);

      const amount = 1;
      await mockLSP7.connect(LSP7Holder).mint(LSP7Holder, amount);
      await mockLSP7
        .connect(LSP7Holder)
        .transfer(await LSP7Holder.getAddress(), mockUPAddress, amount, true, "0x");

      const balanceOfUp = await mockLSP7.balanceOf(mockUPAddress);
      expect(balanceOfUp).to.equal(amount);
    });

    it("should invoke executive assistants when they are found", async function () {
      const encodedData = customEncodeAddresses([mockAssistantAddress]);
      await mockUP.setData(typeMappingKey, encodedData);

      const amount = 1;
      await mockLSP7.connect(LSP7Holder).mint(LSP7Holder, amount);

      await expect(
        mockLSP7
          .connect(LSP7Holder)
          .transfer(await LSP7Holder.getAddress(), mockUPAddress, amount, true, "0x"),
      )
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(mockUPAddress, mockAssistantAddress);
    });

    it("should invoke executive assistants after evaluating true screener assistant", async function () {
      const encodedAssistantsData = customEncodeAddresses([mockAssistantAddress]);
      await mockUP.setData(typeMappingKey, encodedAssistantsData);

      const assistantScreenerKey = generateMappingKey("UAPExecutiveScreeners", mockAssistantAddress);
      const encodedScreenersData = customEncodeAddresses([mockTrueScreenerAssistantAddress]);
      await mockUP.setData(assistantScreenerKey, encodedScreenersData);

      const amount = 1;
      await mockLSP7.connect(LSP7Holder).mint(LSP7Holder, amount);

      await expect(
        mockLSP7
          .connect(LSP7Holder)
          .transfer(await LSP7Holder.getAddress(), mockUPAddress, amount, true, "0x"),
      )
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(mockUPAddress, mockAssistantAddress);
    });

    it("should handle executive call failures through revert", async function () {
      const encodedAssistantsData = customEncodeAddresses([mockBadAssistantAddress]);
      await mockUP.setData(typeMappingKey, encodedAssistantsData);

      const amount = 1;
      await mockLSP7.connect(LSP7Holder).mint(LSP7Holder, amount);

      await expect(
        mockLSP7
          .connect(LSP7Holder)
          .transfer(await LSP7Holder.getAddress(), mockUPAddress, amount, true, "0x"),
      ).to.be.revertedWithCustomError(mockBadAssistant, "AlwaysFalseError");
    });

    it("should correctly decode addresses in customDecodeAddresses function", async function () {
      const addresses = [await owner.getAddress(), await nonOwner.getAddress()];
      const encodedData = customEncodeAddresses(addresses);
      const decodedAddresses = await universalReceiverDelegateUAP.customDecodeAddresses(encodedData);

      expect(decodedAddresses[0]).to.equal(addresses[0]);
      expect(decodedAddresses[1]).to.equal(addresses[1]);
    });

    it("should forward LSP7 tokens to the target address using the ForwarderAssistant", async function () {
      const typeMappingKey = generateMappingKey(
        "UAPTypeConfig",
        LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification,
      );
      const encodedAssistantsData = customEncodeAddresses([forwarderAssistantAddress]);
      await mockUP.setData(typeMappingKey, encodedAssistantsData);

      const assistantInstructionsKey = generateMappingKey("UAPExecutiveConfig", forwarderAssistantAddress);
      const targetAddress = await nonOwner.getAddress();
      const abi = new ethers.AbiCoder();
      const encodedInstructions = abi.encode(["address"], [targetAddress]);
      await mockUP.setData(assistantInstructionsKey, encodedInstructions);

      await mockLSP7.connect(LSP7Holder).mint(LSP7Holder, 1);
      await mockLSP7
        .connect(LSP7Holder)
        .transfer(await LSP7Holder.getAddress(), mockUPAddress, 1, true, "0x");

      expect(await mockLSP7.balanceOf(targetAddress)).to.equal(1);
    });

    it("should forward LSP8 tokens to the target address using the ForwarderAssistant", async function () {
      const typeMappingKey = generateMappingKey(
        "UAPTypeConfig",
        LSP1_TYPE_IDS.LSP8Tokens_RecipientNotification,
      );
      const encodedAssistantsData = customEncodeAddresses([forwarderAssistantAddress]);
      await mockUP.setData(typeMappingKey, encodedAssistantsData);

      const assistantInstructionsKey = generateMappingKey("UAPExecutiveConfig", forwarderAssistantAddress);
      const targetAddress = await nonOwner.getAddress();
      const abi = new ethers.AbiCoder();
      const encodedInstructions = abi.encode(["address"], [targetAddress]);
      await mockUP.setData(assistantInstructionsKey, encodedInstructions);

      const tokenId =
        "0x0000000000000000000000000000000000000000000000000000000000000001";
      await mockLSP8.connect(LSP8Holder).mint(LSP8Holder, tokenId);

      await mockLSP8
        .connect(LSP8Holder)
        .transfer(await LSP8Holder.getAddress(), mockUPAddress, tokenId, true, "0x");

      const tokenOwner = await mockLSP8.tokenOwnerOf(tokenId);
      expect(tokenOwner).to.equal(targetAddress);
    });
  });
});

/**
 * Helpers
 */

export const generateMappingKey = (keyName: string, typeId: string): string => {
  const hashedKey = ethers.keccak256(ethers.toUtf8Bytes(keyName));
  const first10Bytes = hashedKey.slice(2, 22);
  const last20Bytes = typeId.slice(2, 42);
  return "0x" + first10Bytes + "0000" + last20Bytes;
};

export const generateMappingWithGroupingKey = (
  firstWord: string,
  secondWord: string,
  address: string,
): string => {
  const hashedFirstWord = ethers.keccak256(ethers.toUtf8Bytes(firstWord));
  const hashedSecondWord = ethers.keccak256(ethers.toUtf8Bytes(secondWord));
  const first6Bytes = hashedFirstWord.slice(2, 14);
  const second4Bytes = hashedSecondWord.slice(2, 10);
  const last20Bytes = address.slice(2, 42);
  return "0x" + first6Bytes + second4Bytes + "0000" + last20Bytes;
};


