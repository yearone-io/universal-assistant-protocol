import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { ERC725YDataKeys, LSP1_TYPE_IDS } from "@lukso/lsp-smart-contracts";
import {
  ForwarderAssistant,
  MockAssistant,
  MockBadAssistant,
  MockBadScreenerAssistant,
  MockFalseScreenerAssistant,
  MockLSP8IdentifiableDigitalAsset,
  MockTrueScreenerAssistant,
  UniversalReceiverDelegateUAP
} from "../typechain-types";
import { setupProfileWithKeyManagerWithURD } from "./up-utils";

describe("UniversalReceiverDelegateUAP", function () {
  let owner: Signer;
  let nonOwner: Signer;
  let LSP8Holder: Signer;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let universalReceiverDelegateUAPAddress: string;
  let forwarderAssistant: ForwarderAssistant;
  let forwarderAssistantAddress: string;
  let mockLSP8: MockLSP8IdentifiableDigitalAsset;
  let mockLSP8Address: string;
  let mockUP: any;
  let mockUPAddress: string;

  beforeEach(async function () {
    [owner, nonOwner, LSP8Holder] = await ethers.getSigners();
    const ownerAddress = await owner.getAddress();

    // deploy UP account
    const [universalProfile, universalReceiverDelegateUAPInitial] = await setupProfileWithKeyManagerWithURD(owner);

    universalReceiverDelegateUAP = universalReceiverDelegateUAPInitial;
    universalReceiverDelegateUAPAddress = await universalReceiverDelegateUAP.getAddress();

    mockUP = universalProfile;
    mockUPAddress = await universalProfile.getAddress();

    const permissionsKey = generateMappingWithGroupingKey("AddressPermissions", "Permissions", ownerAddress);
    console.log("permissions key", permissionsKey);
    console.log("Owner Permissions", await mockUP.getData(generateMappingWithGroupingKey("AddressPermissions", "Permissions", ownerAddress)));

    const ForwarderAssistantFactory = await ethers.getContractFactory("ForwarderAssistant");
    forwarderAssistant = (await ForwarderAssistantFactory.deploy()) as ForwarderAssistant;
    await forwarderAssistant.waitForDeployment();
    forwarderAssistantAddress = await forwarderAssistant.getAddress();

    const MockLSP8Factory = await ethers.getContractFactory("MockLSP8IdentifiableDigitalAsset");
    mockLSP8 = (await MockLSP8Factory.deploy("Mock LSP8 Token", "MLSP8", await LSP8Holder.getAddress())) as MockLSP8IdentifiableDigitalAsset;
    await mockLSP8.waitForDeployment();
    mockLSP8Address = await mockLSP8.getAddress();
    console.log("MockLSP8IdentifiableDigitalAsset deployed to: ", mockLSP8Address);
    console.log("mockUPAddress: ", mockUPAddress);

  });

  describe("universalReceiverDelegate", function () {

    it("should forward LSP8 tokens to the target address using the ForwarderAssistant", async function () {
      // Generate and set the type config data
      const typeMappingKey = generateMappingKey('UAPTypeConfig', LSP1_TYPE_IDS.LSP8Tokens_RecipientNotification);
      const encodedAssistantsData = customEncodeAddresses([forwarderAssistantAddress]);
      await mockUP.setData(typeMappingKey, encodedAssistantsData);

      // Generate and set the executive config data
      const assistantInstructionsKey = generateMappingKey('UAPExecutiveConfig', forwarderAssistantAddress);
      const targetAddress = await nonOwner.getAddress();
      const abi = new ethers.AbiCoder;
      const encodedInstructions = abi.encode(["address"], [targetAddress]);
      await mockUP.setData(assistantInstructionsKey, encodedInstructions);

      // Generate and set the URDUAP as the default URD for LSP8 tokens
      const LSP8URDdataKey = ERC725YDataKeys.LSP1.LSP1UniversalReceiverDelegatePrefix +
        LSP1_TYPE_IDS.LSP8Tokens_RecipientNotification.slice(2).slice(0, 40);
      await mockUP.setData(LSP8URDdataKey, universalReceiverDelegateUAPAddress);
      console.log("URD Address", await mockUP.getData(LSP8URDdataKey));

      // Give the URDUAP the necessary permissions

  
      // Mint an LSP8 token to owner
      const tokenId = "0x0000000000000000000000000000000000000000000000000000000000000001";
      await mockLSP8.connect(LSP8Holder).mint(LSP8Holder, tokenId);
  
      // Transfer the LSP8 token to the LSP0 (UP)
      console.log(`\n\nAsset: ${mockLSP8Address}`);
      console.log(`Sender: ${await LSP8Holder.getAddress()}`);
      console.log(`Intended Receiver: ${mockUPAddress}`);
      console.log(`Redirected Receiver: ${targetAddress}\n\n`);
      await mockLSP8.connect(LSP8Holder).transfer(await LSP8Holder.getAddress(), mockUPAddress, tokenId, true, "0x");
  
      // Check that the token has been forwarded to the target address
      const tokenOwner = await mockLSP8.tokenOwnerOf(tokenId);
      expect(tokenOwner).to.equal(targetAddress);
    });

    it.skip("should revert if a screener assistant is not trusted", async function () {
    });

    it.skip("should revert if an executive assistant is not trusted", async function () {
    });
  });
});

export const generateMappingKey = (keyName: string, typeId: string): string => {
  const hashedKey = ethers.keccak256(ethers.toUtf8Bytes(keyName));
  const first10Bytes = hashedKey.slice(2, 22);
  const last20Bytes = typeId.slice(2, 42);
  return '0x' + first10Bytes + '0000' + last20Bytes;
};

export const generateMappingWithGroupingKey = (firstWord: string, secondWord: string, address: string): string => {
  const hashedFirstWord = ethers.keccak256(ethers.toUtf8Bytes(firstWord));
  const hashedSecondWord = ethers.keccak256(ethers.toUtf8Bytes(secondWord));
  const first6Bytes = hashedFirstWord.slice(2, 14);
  const second4Bytes = hashedSecondWord.slice(2, 10);
  const last20Bytes = address.slice(2, 42);
  return '0x' + first6Bytes + second4Bytes + '0000' + last20Bytes;
}

export function customEncodeAddresses(addresses: string[]): string {
  if (addresses.length > 65535) {
    throw new Error("Number of addresses exceeds uint16 capacity.");
  }

  // Use ethers v6 `solidityPacked` to encode the length and addresses
  const encoded = ethers.solidityPacked(
    ["uint16", ...Array(addresses.length).fill("address")],
    [addresses.length, ...addresses]
  );

  return encoded;
}
