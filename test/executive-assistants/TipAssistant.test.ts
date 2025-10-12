import { ethers } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";
import { OPERATION_TYPES, LSP1_TYPE_IDS, PERMISSIONS } from "@lukso/lsp-smart-contracts";
import { deployUniversalProfile, encodeTupleKeyValue } from "../utils/TestUtils";
import { TipAssistant } from "../../typechain-types/contracts/executive-assistants/TipAssistant.sol";
import ERC725, { ERC725JSONSchema } from "@erc725/erc725.js";
import uap from '../../schemas/UAP.json';

describe("Executives: TipAssistant", function () {
  let owner: Signer;
  let browserController: Signer;
  let lyxSender: Signer;
  let lyxSenderController: Signer;
  let lyxTipReceiver: Signer;
  let universalProfile: any;
  let senderUniversalProfile: any;
  let universalReceiverDelegateUAP: any;
  let tipAssistant1: TipAssistant;
  let tipAssistant2: TipAssistant;
  let erc725UAP: ERC725;

  beforeEach(async function () {
    [owner, browserController, lyxSender, lyxSenderController, lyxTipReceiver] = await ethers.getSigners();
    ({ universalProfile, universalReceiverDelegateUAP } = await deployUniversalProfile(owner, browserController, [
      PERMISSIONS.SUPER_TRANSFERVALUE
    ]));
    ({ universalProfile: senderUniversalProfile } = await deployUniversalProfile(lyxSender, lyxSenderController));
    erc725UAP = new ERC725(uap as ERC725JSONSchema[], universalProfile.target, ethers.provider);

    const TipAssistantFactory = await ethers.getContractFactory("TipAssistant");
    tipAssistant1 = await TipAssistantFactory.deploy();
    tipAssistant2 = await TipAssistantFactory.deploy();
  });

  async function subscribeTipAssistant(tipAssistantAddr: string, tipRecipient: string, tipPerc: number) {
    // set type
    const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
    const existing = await universalProfile.getData(typeKey);
    let addresses: string[] = existing && existing !== "0x" ? [...(erc725UAP.decodeValueType("address[]", existing))] : [];
    const order = addresses.length;
    addresses.push(tipAssistantAddr);
    await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [...addresses]));
    // set config
    const tipExecKey = erc725UAP.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [LSP1_TYPE_IDS.LSP0ValueReceived, order.toString()]);
    const encodedTipConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [tipRecipient, tipPerc]);
    const encodedTipExecData = encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [tipAssistantAddr, encodedTipConfig]);
    await universalProfile.setData(tipExecKey, encodedTipExecData);
  }

  async function unsubscribeURD() {
    const LSP1DelegateKey = ethers.keccak256(ethers.toUtf8Bytes("LSP1UniversalReceiverDelegate"));
    await universalProfile.setData(LSP1DelegateKey, ethers.ZeroAddress);
  }

  async function sendLYX(amountEth: string) {
    return senderUniversalProfile.connect(lyxSender).execute(
      OPERATION_TYPES.CALL,
      universalProfile.target,
      ethers.parseEther(amountEth),
      "0x"
    );
  }

  it("No config => revert with TipConfigNotSet", async function () {
    // Set UAPRevertOnFailure to true to get original behavior
    const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
    await universalProfile.setData(revertOnFailureKey, erc725UAP.encodeValueType("bool", true));
    
    const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
    await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [tipAssistant1.target]));
    await expect(sendLYX("1")).to.be.revertedWithCustomError(tipAssistant1, "TipConfigNotSet");
  });

  it("Zero address => revert InvalidTipRecipient", async function () {
    // Set UAPRevertOnFailure to true to get original behavior
    const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
    await universalProfile.setData(revertOnFailureKey, erc725UAP.encodeValueType("bool", true));
    
    await subscribeTipAssistant(tipAssistant1.target, ethers.ZeroAddress, 10);
    await expect(sendLYX("1")).to.be.revertedWithCustomError(tipAssistant1, "InvalidTipRecipient");
  });

  it("tipPercentage = 0 => revert InvalidTipPercentage", async function () {
    // Set UAPRevertOnFailure to true to get original behavior
    const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
    await universalProfile.setData(revertOnFailureKey, erc725UAP.encodeValueType("bool", true));
    
    await subscribeTipAssistant(tipAssistant1.target, await lyxTipReceiver.getAddress(), 0);
    await expect(sendLYX("1")).to.be.revertedWithCustomError(tipAssistant1, "InvalidTipPercentage");
  });

  it("tipPercentage > 100 => revert InvalidTipPercentage", async function () {
    // Set UAPRevertOnFailure to true to get original behavior
    const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
    await universalProfile.setData(revertOnFailureKey, erc725UAP.encodeValueType("bool", true));
    
    await subscribeTipAssistant(tipAssistant1.target, await lyxTipReceiver.getAddress(), 101);
    await expect(sendLYX("1")).to.be.revertedWithCustomError(tipAssistant1, "InvalidTipPercentage");
  });

  it("TipAssistant1: 50% => 1 LYX => 0.5 tip, 0.5 leftover", async function () {
    await subscribeTipAssistant(tipAssistant1.target, await lyxTipReceiver.getAddress(), 50);
    const upAddr = universalProfile.target;
    const tipAddr = await lyxTipReceiver.getAddress();
    const upBefore = await ethers.provider.getBalance(upAddr);
    const tipBefore = await ethers.provider.getBalance(tipAddr);

    const tx = await sendLYX("1");
    await expect(tx).to.emit(universalReceiverDelegateUAP, "AssistantInvoked").withArgs(upAddr, tipAssistant1.target);
    await tx.wait();

    expect(await ethers.provider.getBalance(upAddr)).to.equal(upBefore + ethers.parseEther("0.5"));
    expect(await ethers.provider.getBalance(tipAddr)).to.equal(tipBefore + ethers.parseEther("0.5"));
  });

  it("Scenario: Subscribed to only URD, send LYX => no assistant triggered", async function () {
    const upAddr = universalProfile.target;
    const initialBalance = await ethers.provider.getBalance(upAddr);
    const tx = await owner.sendTransaction({ to: upAddr, value: ethers.parseEther("1") });
    await tx.wait();
    expect(await ethers.provider.getBalance(upAddr)).to.equal(initialBalance + ethers.parseEther("1"));
  });

  it("Scenario: Unsubscribed from URD, send LYX => no assistant triggered", async function () {
    await unsubscribeURD();
    const upAddr = universalProfile.target;
    const initialBalance = await ethers.provider.getBalance(upAddr);
    const tx = await owner.sendTransaction({ to: upAddr, value: ethers.parseEther("1") });
    await tx.wait();
    expect(await ethers.provider.getBalance(upAddr)).to.equal(initialBalance + ethers.parseEther("1"));
  });

  describe("Two TipAssistants => order matters for final distribution", function () {
    let secondTipReceiver: Signer;

    beforeEach(async () => {
      [, , , , , secondTipReceiver] = await ethers.getSigners();
    });

    it("TipAssistant1(50%) then TipAssistant2(50%) => total 75% taken, 25% leftover", async function () {
      const upAddr = universalProfile.target;
      const firstReceiver = await lyxTipReceiver.getAddress();
      const secondReceiver = await secondTipReceiver.getAddress();

      await subscribeTipAssistant(tipAssistant1.target, firstReceiver, 50);
      await subscribeTipAssistant(tipAssistant2.target, secondReceiver, 50);

      const upBefore = await ethers.provider.getBalance(upAddr);
      const firstBefore = await ethers.provider.getBalance(firstReceiver);
      const secondBefore = await ethers.provider.getBalance(secondReceiver);

      const tx = await sendLYX("1");
      await expect(tx).to.emit(universalReceiverDelegateUAP, "AssistantInvoked").withArgs(upAddr, tipAssistant1.target);
      await expect(tx).to.emit(universalReceiverDelegateUAP, "AssistantInvoked").withArgs(upAddr, tipAssistant2.target);
      await tx.wait();

      expect(await ethers.provider.getBalance(upAddr)).to.equal(upBefore + ethers.parseEther("0.25"));
      expect(await ethers.provider.getBalance(firstReceiver)).to.equal(firstBefore + ethers.parseEther("0.5"));
      expect(await ethers.provider.getBalance(secondReceiver)).to.equal(secondBefore + ethers.parseEther("0.25"));
    });

    it("TipAssistant1(20%) then TipAssistant2(50%) => total 60% taken, 40% leftover", async function () {
      const upAddr = universalProfile.target;
      const firstReceiver = await lyxTipReceiver.getAddress();
      const secondReceiver = await secondTipReceiver.getAddress();

      await subscribeTipAssistant(tipAssistant1.target, firstReceiver, 20);
      await subscribeTipAssistant(tipAssistant2.target, secondReceiver, 50);

      const upBefore = await ethers.provider.getBalance(upAddr);
      const firstBefore = await ethers.provider.getBalance(firstReceiver);
      const secondBefore = await ethers.provider.getBalance(secondReceiver);

      const tx = await sendLYX("1");
      await tx.wait();

      expect(await ethers.provider.getBalance(upAddr)).to.equal(upBefore + ethers.parseEther("0.4"));
      expect(await ethers.provider.getBalance(firstReceiver)).to.equal(firstBefore + ethers.parseEther("0.2"));
      expect(await ethers.provider.getBalance(secondReceiver)).to.equal(secondBefore + ethers.parseEther("0.4"));
    });

    it("Reverse order => TipAssistant2 first, TipAssistant1 second", async function () {
      const upAddr = universalProfile.target;
      const firstReceiver = await lyxTipReceiver.getAddress();
      const secondReceiver = await secondTipReceiver.getAddress();

      await subscribeTipAssistant(tipAssistant2.target, secondReceiver, 20);
      await subscribeTipAssistant(tipAssistant1.target, firstReceiver, 50);

      const upBefore = await ethers.provider.getBalance(upAddr);
      const firstBefore = await ethers.provider.getBalance(firstReceiver);
      const secondBefore = await ethers.provider.getBalance(secondReceiver);

      const tx = await sendLYX("1");
      await tx.wait();

      expect(await ethers.provider.getBalance(upAddr)).to.equal(upBefore + ethers.parseEther("0.4"));
      expect(await ethers.provider.getBalance(secondReceiver)).to.equal(secondBefore + ethers.parseEther("0.2"));
      expect(await ethers.provider.getBalance(firstReceiver)).to.equal(firstBefore + ethers.parseEther("0.4"));
    });
  });
});