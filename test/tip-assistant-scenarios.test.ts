import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";
import {
  LSP1UniversalReceiverDelegateUP,
  UniversalProfile,
  UniversalReceiverDelegateUAP,
} from "../typechain-types";
import {
  setupProfileWithKeyManagerWithURD,
  grantBrowserExtensionUrdSetPermissions,
  setLSP1UniversalReceiverDelegate,
} from "./up-utils";
import { TipAssistant } from "../typechain-types/contracts/executive-assistants/TipAssistant.sol";
import { customEncodeAddresses } from "./helpers/encoding";
import {
  LSP1_TYPE_IDS,
  OPERATION_TYPES,
  PERMISSIONS,
} from "@lukso/lsp-smart-contracts";

export const provider = ethers.provider;

describe("TipAssistant", function () {
  let owner: Signer;
  let browserController: Signer;
  let lyxSenderController: Signer;
  let lyxSender: Signer;
  let lyxTipReceiver: Signer;
  let universalProfile: UniversalProfile;
  let lsp1universalReceiverDelegateUP: LSP1UniversalReceiverDelegateUP;
  let senderUniversalProfile: UniversalProfile;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let tipAssistant1: TipAssistant;
  let tipAssistant2: TipAssistant;
  let tipAssistant1Address: string;
  let tipAssistant2Address: string;

  beforeEach(async function () {
    [
      owner,
      browserController,
      lyxSender,
      lyxSenderController,
      lyxTipReceiver
    ] = await ethers.getSigners();

    [universalProfile,,lsp1universalReceiverDelegateUP] = await setupProfileWithKeyManagerWithURD(
      owner,
      browserController
    );
    [senderUniversalProfile] = await setupProfileWithKeyManagerWithURD(
      lyxSender,
      lyxSenderController
    );

    // Grant URDuap SUPER_TRANSFERVALUE so it can send LYX from the UP
    await grantBrowserExtensionUrdSetPermissions(
      owner,
      browserController,
      universalProfile
    );

    // Set the URDuap with the necessary permissions
    [universalReceiverDelegateUAP] = await setLSP1UniversalReceiverDelegate(
      browserController,
      universalProfile,
      [PERMISSIONS.SUPER_TRANSFERVALUE]
    );

    const TipAssistantFactory = await ethers.getContractFactory("TipAssistant");
    tipAssistant1 = (await TipAssistantFactory.deploy()) as TipAssistant;
    tipAssistant2 = (await TipAssistantFactory.deploy()) as TipAssistant;

    tipAssistant1Address = await tipAssistant1.getAddress();
    tipAssistant2Address = await tipAssistant2.getAddress();
  });

  async function subscribeTipAssistant(
    tipAssistantAddr: string,
    tipRecipient: string,
    tipPerc: number
  ) {
    // Use the same typeId as in TipAssistant => LSP1_TYPE_IDS.LSP0ValueReceived
    const typeKey = generateMappingKey("UAPTypeConfig", LSP1_TYPE_IDS.LSP0ValueReceived);

    // Read current addresses
    const existing = await universalProfile.getData(typeKey);
    let addresses: string[] = [];

    if (existing && existing !== "0x") {
      // decode -> returns an ethers "Result" which is immutable
      const decoded = await universalReceiverDelegateUAP.customDecodeAddresses(
        existing
      );
      // spread into a new array
      addresses = [...decoded];
    }

    // Add the new assistant
    addresses.push(tipAssistantAddr);

    // Encode & store
    const encodedAssistants = customEncodeAddresses(addresses);
    await universalProfile.setData(typeKey, encodedAssistants);

    // Now set the instructions (tipRecipient, tipPerc)
    const execKey = generateMappingKey("UAPExecutiveConfig", tipAssistantAddr);
    const instructions = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [tipRecipient, tipPerc]
    );
    await universalProfile.setData(execKey, instructions);
  }


  async function unsubscribeURD() {
    // Unsubscribe URD by setting the LSP1 delegate to address(0)
    // or any default address not running universalReceiverDelegate code
    // E.g. directly in the Key Manager or the profile's data key for LSP1UniversalReceiverDelegate
    const LSP1DelegateKey = ethers.keccak256(
        ethers.toUtf8Bytes("LSP1UniversalReceiverDelegate")
      );
    const urdUPAddress: string = await lsp1universalReceiverDelegateUP.getAddress();
    await universalProfile.setData(LSP1DelegateKey, urdUPAddress); 
  }

  async function sendLYX(amountEth: string) {
    return senderUniversalProfile
      .connect(lyxSender)
      .execute(
        OPERATION_TYPES.CALL,
        await universalProfile.getAddress(),
        ethers.parseEther(amountEth),
        "0x"
      );
  }

  it("No config => revert with TipConfigNotSet", async function () {
    // We only set the tipAssistant in UAPTypeConfig, 
    // but we do NOT store the instructions => tipAssistant sees empty config => revert
    const typeKey = generateMappingKey("UAPTypeConfig", LSP1_TYPE_IDS.LSP0ValueReceived);
    const encoded = customEncodeAddresses([tipAssistant1Address]);
    await universalProfile.setData(typeKey, encoded);
    await expect(sendLYX("1")).to.be.revertedWithCustomError(
      tipAssistant1,
      "TipConfigNotSet"
    );
  });

  it("Zero address => revert InvalidTipRecipient", async function () {
    const typeKey = generateMappingKey("UAPTypeConfig", LSP1_TYPE_IDS.LSP0ValueReceived);
    const encoded = customEncodeAddresses([tipAssistant1Address]);
    await universalProfile.setData(typeKey, encoded);

    // config => (0x0, 10)
    const execKey = generateMappingKey("UAPExecutiveConfig", tipAssistant1Address);
    const instructions = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [ethers.ZeroAddress, 10]
    );
    await universalProfile.setData(execKey, instructions);

    await expect(sendLYX("1")).to.be.revertedWithCustomError(
      tipAssistant1,
      "InvalidTipRecipient"
    );
  });

  it("tipPercentage = 0 => revert InvalidTipPercentage", async function () {
    const typeKey = generateMappingKey("UAPTypeConfig", LSP1_TYPE_IDS.LSP0ValueReceived);
    const encoded = customEncodeAddresses([tipAssistant1Address]);
    await universalProfile.setData(typeKey, encoded);

    const execKey = generateMappingKey("UAPExecutiveConfig", tipAssistant1Address);
    const instructions = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [await lyxTipReceiver.getAddress(), 0]
    );
    await universalProfile.setData(execKey, instructions);

    await expect(sendLYX("1")).to.be.revertedWithCustomError(
      tipAssistant1,
      "InvalidTipPercentage"
    );
  });

  it("tipPercentage > 100 => revert InvalidTipPercentage", async function () {
    const typeKey = generateMappingKey("UAPTypeConfig", LSP1_TYPE_IDS.LSP0ValueReceived);
    const encoded = customEncodeAddresses([tipAssistant1Address]);
    await universalProfile.setData(typeKey, encoded);

    const execKey = generateMappingKey("UAPExecutiveConfig", tipAssistant1Address);
    const instructions = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [await lyxTipReceiver.getAddress(), 101]
    );
    await universalProfile.setData(execKey, instructions);

    await expect(sendLYX("1")).to.be.revertedWithCustomError(
      tipAssistant1,
      "InvalidTipPercentage"
    );
  });

  it("TipAssistant1: 50% => 1 LYX => 0.5 tip, 0.5 leftover", async () => {
    await subscribeTipAssistant(
      tipAssistant1Address,
      await lyxTipReceiver.getAddress(),
      50
    );

    const upAddr = await universalProfile.getAddress();
    const tipAddr = await lyxTipReceiver.getAddress();
    const upBefore = await provider.getBalance(upAddr);
    const tipBefore = await provider.getBalance(tipAddr);

    const tx = sendLYX("1");
    await expect(tx)
      .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
      .withArgs(upAddr, tipAssistant1Address);
    await tx;

    const upAfter = await provider.getBalance(upAddr);
    const tipAfter = await provider.getBalance(tipAddr);

    expect(upAfter).to.equal(upBefore + ethers.parseEther("0.5"));
    expect(tipAfter).to.equal(tipBefore + ethers.parseEther("0.5"));
  });

  it("Scenario: Subscribed to only URD, send LYX => no assistant triggered", async () => {
    const UPAddress = await universalProfile.getAddress();
    const [sender] = await ethers.getSigners();

    const initialBalance = await ethers.provider.getBalance(UPAddress);
    const tx = await sender.sendTransaction({
      to: UPAddress,
      value: ethers.parseEther("1"),
    });
    await tx.wait();

    const finalBalance = await ethers.provider.getBalance(UPAddress);
    expect(finalBalance).to.equal(initialBalance + ethers.parseEther("1"));
    // No "AssistantInvoked" event => no tip assistant triggered
  });

  it("Scenario: Unsubscribed from URD, send LYX => no assistant triggered", async () => {
    await unsubscribeURD();
    const UPAddress = await universalProfile.getAddress();

    const initialBalance = await ethers.provider.getBalance(UPAddress);
    const [sender] = await ethers.getSigners();
    const tx = await sender.sendTransaction({
      to: UPAddress,
      value: ethers.parseEther("1"),
    });
    await tx.wait();

    const finalBalance = await ethers.provider.getBalance(UPAddress);
    expect(finalBalance).to.equal(initialBalance + ethers.parseEther("1"));
  });

  describe("Two TipAssistants => order matters for final distribution", function () {
    let secondTipReceiver: Signer;

    beforeEach(async () => {
      // Grab an extra signer for the second tip
      [, , , , , secondTipReceiver] = await ethers.getSigners();
    });

    it("TipAssistant1(50%) then TipAssistant2(50%) => total 75% taken, 25% leftover", async () => {
      const upAddr = await universalProfile.getAddress();
      const firstReceiver = await lyxTipReceiver.getAddress();
      const secondReceiver = await secondTipReceiver.getAddress();

      // Add tip1 => 50%
      await subscribeTipAssistant(tipAssistant1Address, firstReceiver, 50);
      // Then tip2 => 50% of leftover
      await subscribeTipAssistant(tipAssistant2Address, secondReceiver, 50);

      const upBefore = await provider.getBalance(upAddr);
      const firstBefore = await provider.getBalance(firstReceiver);
      const secondBefore = await provider.getBalance(secondReceiver);

      const tx = sendLYX("1");

      // Both invoked in sequence
      await expect(tx)
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddr, tipAssistant1Address);
      await expect(tx)
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddr, tipAssistant2Address);

      await tx;
      const upAfter = await provider.getBalance(upAddr);
      const firstAfter = await provider.getBalance(firstReceiver);
      const secondAfter = await provider.getBalance(secondReceiver);

      // tip1 => 0.5, leftover => 0.5
      // tip2 => 0.25, leftover => 0.25
      expect(upAfter).to.equal(upBefore + ethers.parseEther("0.25"));
      expect(firstAfter).to.equal(firstBefore + ethers.parseEther("0.5"));
      expect(secondAfter).to.equal(secondBefore + ethers.parseEther("0.25"));
    });

    it("TipAssistant1(20%) then TipAssistant2(50%) => total 60% taken, 40% leftover", async () => {
      const upAddr = await universalProfile.getAddress();
      const firstReceiver = await lyxTipReceiver.getAddress();
      const secondReceiver = await secondTipReceiver.getAddress();

      await subscribeTipAssistant(tipAssistant1Address, firstReceiver, 20);
      await subscribeTipAssistant(tipAssistant2Address, secondReceiver, 50);

      const upBefore = await provider.getBalance(upAddr);
      const firstBefore = await provider.getBalance(firstReceiver);
      const secondBefore = await provider.getBalance(secondReceiver);

      const tx = sendLYX("1");
      await tx;

      const upAfter = await provider.getBalance(upAddr);
      const firstAfter = await provider.getBalance(firstReceiver);
      const secondAfter = await provider.getBalance(secondReceiver);

      // tip1 => 0.2, leftover => 0.8
      // tip2 => 0.4, leftover => 0.4
      expect(upAfter).to.equal(upBefore + ethers.parseEther("0.4"));
      expect(firstAfter).to.equal(firstBefore + ethers.parseEther("0.2"));
      expect(secondAfter).to.equal(secondBefore + ethers.parseEther("0.4"));
    });

    it("Reverse order => TipAssistant2 first, TipAssistant1 second", async () => {
      const upAddr = await universalProfile.getAddress();
      const firstReceiver = await lyxTipReceiver.getAddress();
      const secondReceiver = await secondTipReceiver.getAddress();

      // tip2 => 20% => add it first
      await subscribeTipAssistant(tipAssistant2Address, secondReceiver, 20);
      // tip1 => 50% => added second
      await subscribeTipAssistant(tipAssistant1Address, firstReceiver, 50);

      const upBefore = await provider.getBalance(upAddr);
      const firstBefore = await provider.getBalance(firstReceiver);
      const secondBefore = await provider.getBalance(secondReceiver);

      const tx = sendLYX("1");
      await tx;

      const upAfter = await provider.getBalance(upAddr);
      const firstAfter = await provider.getBalance(firstReceiver);
      const secondAfter = await provider.getBalance(secondReceiver);

      // tip2 => 0.2, leftover => 0.8
      // tip1 => 0.4, leftover => 0.4
      expect(upAfter).to.equal(upBefore + ethers.parseEther("0.4"));
      expect(secondAfter).to.equal(secondBefore + ethers.parseEther("0.2"));
      expect(firstAfter).to.equal(firstBefore + ethers.parseEther("0.4"));
    });
    
  });
});

/**
 * Helpers
 */
function generateMappingKey(keyName: string, typeId: string): string {
  const hashedKey = ethers.keccak256(ethers.toUtf8Bytes(keyName));
  const first10Bytes = hashedKey.slice(2, 22);
  const last20Bytes = typeId.slice(2, 42);
  return "0x" + first10Bytes + "0000" + last20Bytes;
}
