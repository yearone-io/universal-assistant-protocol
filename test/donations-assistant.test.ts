import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { LSP1_TYPE_IDS, OPERATION_TYPES, PERMISSIONS } from "@lukso/lsp-smart-contracts";
import { UniversalProfile, UniversalReceiverDelegateUAP } from "../typechain-types";
import {
  grantBrowserExtensionUrdSetPermissions,
  setLSP1UniversalReceiverDelegate,
  setupProfileWithKeyManagerWithURD
} from "./up-utils";
import {
  DynamicDonationAssistant
} from "../typechain-types/contracts/executive-assistants/DynamicDonationAssistant.sol";
export const provider = ethers.provider;

describe("DynamicDonationAssistant", function () {
  let owner: Signer;
  let browserController: Signer;
  let lyxSenderController: Signer;
  let senderUniversalProfile: UniversalProfile;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let universalProfile: UniversalProfile;
  let lyxSender: Signer;
  let lyxDonationReceiver: Signer;
  let dynamicDonationAssistant: DynamicDonationAssistant;
  let dynamicDonationAssistantAddress: string;

  beforeEach(async function () {
    [owner, browserController, lyxSender, lyxSenderController, lyxDonationReceiver] = await ethers.getSigners();

    // deploy UP account
    [universalProfile] = await setupProfileWithKeyManagerWithURD(owner, browserController);
    [senderUniversalProfile] = await setupProfileWithKeyManagerWithURD(lyxSender, lyxSenderController);

    await grantBrowserExtensionUrdSetPermissions(owner, browserController, universalProfile);


    [universalReceiverDelegateUAP] = await setLSP1UniversalReceiverDelegate(
      browserController,
      universalProfile,
      [
        PERMISSIONS.SUPER_TRANSFERVALUE
      ]
    );

    const DynamicDonationAssistantFactory =
      await ethers.getContractFactory("DynamicDonationAssistant");
    dynamicDonationAssistant =
      (await DynamicDonationAssistantFactory.deploy()) as DynamicDonationAssistant;
    await dynamicDonationAssistant.waitForDeployment();
    dynamicDonationAssistantAddress = await dynamicDonationAssistant.getAddress();
  });
  
  describe("DynamicDonationAssistant", function () {

    it("should donate some lyx to target account", async function () {
      // Generate and set the type config data
      const typeMappingKey = generateMappingKey(
        "UAPTypeConfig",
        LSP1_TYPE_IDS.LSP0ValueReceived,
      );
      const encodedAssistantsData = customEncodeAddresses([
        dynamicDonationAssistantAddress,
      ]);
      await universalProfile.setData(typeMappingKey, encodedAssistantsData);

      // Generate and set the executive config data
      const assistantInstructionsKey = generateMappingKey(
        "UAPExecutiveConfig",
        dynamicDonationAssistantAddress,
      );
      const targetAddress = await lyxDonationReceiver.getAddress();
      const abi = new ethers.AbiCoder();
      const encodedInstructions = abi.encode(["address", "uint256"], [targetAddress, 10]);
      await universalProfile.setData(assistantInstructionsKey, encodedInstructions);

      //verify before balances
      const lyxReceiverBeforeBalance = await provider.getBalance(await universalProfile.getAddress())
      const donationReceiverBeforeBalance = await provider.getBalance(await lyxDonationReceiver.getAddress())

      // Transfer lyx to target
      await expect(
        await senderUniversalProfile
          .connect(lyxSender)
          .execute(
            OPERATION_TYPES.CALL,
            await universalProfile.getAddress(),
            ethers.parseEther('1'),
            '0x',
          )
      )
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(await universalProfile.getAddress(), dynamicDonationAssistantAddress);

      // check lyx balance of lyxReceiver
      expect(await provider.getBalance(await universalProfile.getAddress())).to.equal(BigInt(lyxReceiverBeforeBalance) + ethers.parseEther('0.9'));
      expect(await provider.getBalance(await lyxDonationReceiver.getAddress())).to.equal(BigInt(donationReceiverBeforeBalance) + ethers.parseEther('0.1'));
    });
    it("should fail if donation percentage is invalid (> 99)", async function () {
      // Generate and set the type config data for the LSP0ValueReceived type
      const typeMappingKey = generateMappingKey(
        "UAPTypeConfig",
        LSP1_TYPE_IDS.LSP0ValueReceived,
      );
      const encodedAssistantsData = customEncodeAddresses([
        dynamicDonationAssistantAddress,
      ]);
      await universalProfile.setData(typeMappingKey, encodedAssistantsData);
    
      // Generate and set the executive config data with an invalid donation percentage (e.g. 101)
      const assistantInstructionsKey = generateMappingKey(
        "UAPExecutiveConfig",
        dynamicDonationAssistantAddress,
      );
      const targetAddress = await lyxDonationReceiver.getAddress();
      const invalidDonationPercentage = 101; // invalid donation percentage (should be between 0 and 99)
      const abi = new ethers.AbiCoder();
      const encodedInstructions = abi.encode(
        ["address", "uint256"],
        [targetAddress, invalidDonationPercentage]
      );
      await universalProfile.setData(assistantInstructionsKey, encodedInstructions);
    
      // Attempt to trigger the donation. This should revert because donationPercentage > 99.
      await expect(
        senderUniversalProfile
          .connect(lyxSender)
          .execute(
            OPERATION_TYPES.CALL,
            await universalProfile.getAddress(),
            ethers.parseEther("1"),
            "0x"
          )
      ).to.be.revertedWithCustomError(dynamicDonationAssistant, "InvalidDonationPercentage");
    });
    
  });
});

export const generateMappingKey = (keyName: string, typeId: string): string => {
  const hashedKey = ethers.keccak256(ethers.toUtf8Bytes(keyName));
  const first10Bytes = hashedKey.slice(2, 22);
  const last20Bytes = typeId.slice(2, 42);
  return "0x" + first10Bytes + "0000" + last20Bytes;
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
