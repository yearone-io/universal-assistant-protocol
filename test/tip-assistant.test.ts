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
  TipAssistant
} from "../typechain-types/contracts/executive-assistants/TipAssistant.sol";
export const provider = ethers.provider;

describe("TipAssistant", function () {
  let owner: Signer;
  let browserController: Signer;
  let lyxSenderController: Signer;
  let protocolFeeRecipient: Signer;
  let senderUniversalProfile: UniversalProfile;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let universalProfile: UniversalProfile;
  let lyxSender: Signer;
  let lyxTipReceiver: Signer;
  let tipAssistant: TipAssistant;
  let tipAssistantAddress: string;

  beforeEach(async function () {
    [owner, browserController, lyxSender, lyxSenderController, lyxTipReceiver, protocolFeeRecipient] = await ethers.getSigners();

    // deploy UP account
    [universalProfile] = await setupProfileWithKeyManagerWithURD(owner, browserController);
    [senderUniversalProfile] = await setupProfileWithKeyManagerWithURD(lyxSender, lyxSenderController);

    await grantBrowserExtensionUrdSetPermissions(owner, browserController, universalProfile);


    [universalReceiverDelegateUAP] = await setLSP1UniversalReceiverDelegate(
      protocolFeeRecipient,
      browserController,
      universalProfile,
      [
        PERMISSIONS.SUPER_TRANSFERVALUE
      ]
    );

    const TipAssistantFactory =
      await ethers.getContractFactory("TipAssistant");
    tipAssistant =
      (await TipAssistantFactory.deploy()) as TipAssistant;
    await tipAssistant.waitForDeployment();
    tipAssistantAddress = await tipAssistant.getAddress();
  });

  describe("TipAssistant", function () {

    it("should donate some lyx to target account without fees if fees are disabled", async function () {
      // Generate and set the type config data
      const typeMappingKey = generateMappingKey(
        "UAPTypeConfig",
        LSP1_TYPE_IDS.LSP0ValueReceived,
      );
      const encodedAssistantsData = customEncodeAddresses([
        tipAssistantAddress,
      ]);
      await universalProfile.setData(typeMappingKey, encodedAssistantsData);

      // Generate and set the executive config data
      const assistantInstructionsKey = generateMappingKey(
        "UAPExecutiveConfig",
        tipAssistantAddress,
      );
      const targetAddress = await lyxTipReceiver.getAddress();
      const abi = new ethers.AbiCoder();
      const encodedInstructions = abi.encode(["address", "uint256"], [targetAddress, 10]);
      await universalProfile.setData(assistantInstructionsKey, encodedInstructions);

      //pause fees
      await universalReceiverDelegateUAP.connect(owner).setFeeEnabled(false);

      //verify before balances
      const lyxReceiverBeforeBalance = await provider.getBalance(await universalProfile.getAddress())
      const tipReceiverBeforeBalance = await provider.getBalance(await lyxTipReceiver.getAddress())

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
        .withArgs(await universalProfile.getAddress(), tipAssistantAddress);

      // check lyx balance of lyxReceiver
      expect(await provider.getBalance(await universalProfile.getAddress())).to.equal(BigInt(lyxReceiverBeforeBalance) + ethers.parseEther('0.9'));
      expect(await provider.getBalance(await lyxTipReceiver.getAddress())).to.equal(BigInt(tipReceiverBeforeBalance) + ethers.parseEther('0.1'));
    });

    it("should donate some lyx to target account", async function () {
      // Generate and set the type config data
      const typeMappingKey = generateMappingKey(
        "UAPTypeConfig",
        LSP1_TYPE_IDS.LSP0ValueReceived,
      );
      const encodedAssistantsData = customEncodeAddresses([
        tipAssistantAddress,
      ]);
      await universalProfile.setData(typeMappingKey, encodedAssistantsData);

      // Generate and set the executive config data
      const assistantInstructionsKey = generateMappingKey(
        "UAPExecutiveConfig",
        tipAssistantAddress,
      );
      const targetAddress = await lyxTipReceiver.getAddress();
      const abi = new ethers.AbiCoder();
      const encodedInstructions = abi.encode(["address", "uint256"], [targetAddress, 10]);
      await universalProfile.setData(assistantInstructionsKey, encodedInstructions);

      //verify before balances
      const protocolFeeReceiverBeforeBalance = await provider.getBalance(await protocolFeeRecipient.getAddress())
      const lyxReceiverBeforeBalance = await provider.getBalance(await universalProfile.getAddress())
      const tipReceiverBeforeBalance = await provider.getBalance(await lyxTipReceiver.getAddress())
      await expect(
        await senderUniversalProfile
          .connect(lyxSender)
          .execute(
            OPERATION_TYPES.CALL,
            await universalProfile.getAddress(),
            ethers.parseEther('1'),
            '0x'
          )
      )
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(await universalProfile.getAddress(), tipAssistantAddress);

      expect(await provider.getBalance(await protocolFeeRecipient.getAddress()))
        .to.equal(BigInt(protocolFeeReceiverBeforeBalance) + ethers.parseEther('0.005'));
      expect(await provider.getBalance(await universalProfile.getAddress()))
        .to.equal(BigInt(lyxReceiverBeforeBalance) + ethers.parseEther('0.8955'));
      expect(await provider.getBalance(await lyxTipReceiver.getAddress()))
        .to.equal(BigInt(tipReceiverBeforeBalance) + ethers.parseEther('0.0995'));

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
