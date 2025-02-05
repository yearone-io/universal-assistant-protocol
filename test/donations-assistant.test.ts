import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { LSP1_TYPE_IDS, OPERATION_TYPES } from "@lukso/lsp-smart-contracts";
import {
  ForwarderAssistant,
  MockAssistant,
  MockBadAssistant,
  MockBadScreenerAssistant,
  MockFalseScreenerAssistant,
  MockLSP8IdentifiableDigitalAsset,
  MockTrueScreenerAssistant, UniversalProfile,
  UniversalReceiverDelegateUAP
} from "../typechain-types";
import {
  grantBrowserExtensionUrdSetPermissions,
  setLSP1UniversalReceiverDelegate,
  setupProfileWithKeyManagerWithURD
} from "./up-utils";
import { MockLSP7DigitalAsset } from "../typechain-types/contracts/mocks";
import {
  DynamicDonationAssistant
} from "../typechain-types/contracts/executive-assistants/DynamicDonationAssistant.sol";
export const provider = ethers.provider;

describe("UniversalReceiverDelegateUAP", function () {
  let owner: Signer;
  let browserController: Signer;
  let lyxSenderController: Signer;
  let nonOwner: Signer;
  let senderUniversalProfile: UniversalProfile;
  let universalProfile: UniversalProfile;
  let lyxSender: Signer;
  let lyxReceiver: Signer;
  let lyxDonationReceiver: Signer;
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
  let dynamicDonationAssistant: DynamicDonationAssistant;
  let dynamicDonationAssistantAddress: string;
  let mockLSP7: MockLSP7DigitalAsset;
  let mockLSP8: MockLSP8IdentifiableDigitalAsset;
  let mockLSP8Address: string;
  let mockUP: any;
  let mockUPAddress: string;

  beforeEach(async function () {
    [owner, browserController, nonOwner, lyxSender, lyxSenderController, lyxReceiver, lyxDonationReceiver] = await ethers.getSigners();
    const browserControllerAddress = await browserController.getAddress();

    // deploy UP account
    [universalProfile] = await setupProfileWithKeyManagerWithURD(owner, browserController);
    [senderUniversalProfile] = await setupProfileWithKeyManagerWithURD(lyxSender, lyxSenderController);

    await grantBrowserExtensionUrdSetPermissions(owner, browserController, universalProfile);

    [universalReceiverDelegateUAP] = await setLSP1UniversalReceiverDelegate(
      browserController,
        universalProfile,
    );

    mockUP = universalProfile;
    mockUPAddress = await universalProfile.getAddress();

    const permissionsKey = generateMappingWithGroupingKey(
      "AddressPermissions",
      "Permissions",
      browserControllerAddress,
    );
    console.log("permissions key", permissionsKey);
    console.log(
      "browser Permissions",
      await mockUP.getData(
        generateMappingWithGroupingKey(
          "AddressPermissions",
          "Permissions",
          browserControllerAddress,
        ),
      ),
    );

    // Deploy mock assistant contracts
    const MockAssistantFactory =
      await ethers.getContractFactory("MockAssistant");
    mockAssistant = (await MockAssistantFactory.deploy()) as MockAssistant;
    mockAssistantAddress = await mockAssistant.getAddress();

    const MockBadAssistantFactory =
      await ethers.getContractFactory("MockBadAssistant");
    mockBadAssistant =
      (await MockBadAssistantFactory.deploy()) as MockBadAssistant;
    mockBadAssistantAddress = await mockBadAssistant.getAddress();

    const DynamicDonationAssistantFactory =
      await ethers.getContractFactory("DynamicDonationAssistant");
    dynamicDonationAssistant =
      (await DynamicDonationAssistantFactory.deploy()) as DynamicDonationAssistant;
    await dynamicDonationAssistant.waitForDeployment();
    dynamicDonationAssistantAddress = await dynamicDonationAssistant.getAddress();

    const MockTrueScreenerAssistantFactory = await ethers.getContractFactory(
      "MockTrueScreenerAssistant",
    );
    mockTrueScreenerAssistant =
      (await MockTrueScreenerAssistantFactory.deploy()) as MockTrueScreenerAssistant;
    mockTrueScreenerAssistantAddress =
      await mockTrueScreenerAssistant.getAddress();

    const MockFalseScreenerAssistantFactory = await ethers.getContractFactory(
      "MockFalseScreenerAssistant",
    );
    mockFalseScreenerAssistant =
      (await MockFalseScreenerAssistantFactory.deploy()) as MockFalseScreenerAssistant;
    mockFalseScreenerAssistantAddress =
      await mockFalseScreenerAssistant.getAddress();

    const MockBadScreenerAssistantFactory = await ethers.getContractFactory(
      "MockBadScreenerAssistant",
    );
    mockBadScreenerAssistant =
      (await MockBadScreenerAssistantFactory.deploy()) as MockBadScreenerAssistant;
    mockBadScreenerAssistantAddress =
      await mockBadScreenerAssistant.getAddress();

    console.log("mockUPAddress: ", mockUPAddress);

    typeMappingKey = generateMappingKey(
      "UAPTypeConfig",
      LSP1_TYPE_IDS.LSP0ValueReceived,
    );
  });
  
  describe.only("DynamicDonationAssistant", function () {

    it("should donate some lyx to target account", async function () {
      // Generate and set the type config data
      const typeMappingKey = generateMappingKey(
        "UAPTypeConfig",
        LSP1_TYPE_IDS.LSP0ValueReceived,
      );
      const encodedAssistantsData = customEncodeAddresses([
        dynamicDonationAssistantAddress,
      ]);
      await mockUP.setData(typeMappingKey, encodedAssistantsData);

      // Generate and set the executive config data
      const assistantInstructionsKey = generateMappingKey(
        "UAPExecutiveConfig",
        dynamicDonationAssistantAddress,
      );
      const targetAddress = await lyxDonationReceiver.getAddress();
      const abi = new ethers.AbiCoder();
      const encodedInstructions = abi.encode(["address", "uint256"], [targetAddress, 10]);
      await mockUP.setData(assistantInstructionsKey, encodedInstructions);

      console.log("donationAddress: ", await lyxDonationReceiver.getAddress());
      console.log("lyxReceiver: ", await universalProfile.getAddress());
      //verify before balances
      // expect(await provider.getBalance(await lyxSender.getAddress())).to.equal("10000000000000000000000");
      expect(await provider.getBalance(await lyxDonationReceiver.getAddress())).to.equal("10000000000000000000000");

      // Transfer lyx to target
      await senderUniversalProfile
        .connect(lyxSender)
        .execute(
          OPERATION_TYPES.CALL,
          await universalProfile.getAddress(),
          ethers.parseEther('1'),
          '0x',
        );

      // check lyx balance of lyxReceiver
      // expect(await provider.getBalance(await owner.getAddress())).to.equal(ethers.parseEther('0.9') + balanceBefore);
      expect(await provider.getBalance(await lyxDonationReceiver.getAddress())).to.equal("10000000100000000000000");
    });
  });
});

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

export function customEncodeAddresses(addresses: string[]): string {
  if (addresses.length > 65535) {
    throw new Error("Number of addresses exceeds uint16 capacity.");
  }

  // Use ethers v6 `solidityPacked` to encode the length and addresses
  const encoded = ethers.solidityPacked(
    ["uint16", ...Array(addresses.length).fill("address")],
    [addresses.length, ...addresses],
  );

  return encoded;
}
