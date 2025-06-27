import { ethers } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";
import { LSP1_TYPE_IDS, OPERATION_TYPES, PERMISSIONS } from "@lukso/lsp-smart-contracts";
import {
  UniversalReceiverDelegateUAP,
  MockBadAssistant,
  TipAssistant,
} from "../../typechain-types";
import { deployUniversalProfile } from "../utils/TestUtils";
import ERC725, { ERC725JSONSchema } from "@erc725/erc725.js";
import { encodeTupleKeyValue } from "@erc725/erc725.js/build/main/src/lib/utils";
import uap from '../../schemas/UAP.json';

describe("UniversalReceiverDelegateUAP: UAPRevertOnFailure Feature", function () {
  let owner: Signer;
  let browserController: Signer;
  let lyxSender: Signer;
  let lyxSenderController: Signer;
  let lsp7Holder: Signer;
  let universalProfile: any;
  let senderUniversalProfile: any;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let mockBadAssistant: MockBadAssistant;
  let tipAssistant: TipAssistant;
  let erc725UAP: ERC725;

  beforeEach(async function () {
    [owner, browserController, lyxSender, lyxSenderController, lsp7Holder] = await ethers.getSigners();
    ({ universalProfile, universalReceiverDelegateUAP } = await deployUniversalProfile(owner, browserController, [
      PERMISSIONS.SUPER_TRANSFERVALUE
    ]));
    ({ universalProfile: senderUniversalProfile } = await deployUniversalProfile(lyxSender, lyxSenderController));
    erc725UAP = new ERC725(uap as ERC725JSONSchema[], universalProfile.target, ethers.provider);

    const MockBadAssistantFactory = await ethers.getContractFactory("MockBadAssistant");
    mockBadAssistant = await MockBadAssistantFactory.deploy();
    
    const TipAssistantFactory = await ethers.getContractFactory("TipAssistant");
    tipAssistant = await TipAssistantFactory.deploy();
  });

  async function sendLYX(amountEth: string) {
    return senderUniversalProfile.connect(lyxSender).execute(
      OPERATION_TYPES.CALL,
      universalProfile.target,
      ethers.parseEther(amountEth),
      "0x"
    );
  }

  describe("UAPRevertOnFailure=false (default behavior)", function () {
    it("should continue execution on assistant failure when UAPRevertOnFailure is not set", async function () {
      // Configure a bad assistant that will fail
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [mockBadAssistant.target]));

      // Send LYX - should not revert, should continue gracefully
      const upAddr = universalProfile.target;
      const initialBalance = await ethers.provider.getBalance(upAddr);
      await expect(sendLYX("1")).to.not.be.reverted;
      expect(await ethers.provider.getBalance(upAddr)).to.equal(initialBalance + ethers.parseEther("1"));
    });

    it("should continue execution on assistant failure when UAPRevertOnFailure is explicitly set to false", async function () {
      // Set UAPRevertOnFailure to false
      const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
      await universalProfile.setData(revertOnFailureKey, erc725UAP.encodeValueType("bool", false));
      
      // Configure a bad assistant that will fail
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [mockBadAssistant.target]));

      // Send LYX - should not revert, should continue gracefully
      const upAddr = universalProfile.target;
      const initialBalance = await ethers.provider.getBalance(upAddr);
      await expect(sendLYX("1")).to.not.be.reverted;
      expect(await ethers.provider.getBalance(upAddr)).to.equal(initialBalance + ethers.parseEther("1"));
    });

    it("should emit ExecutionResult(false) when assistant fails and UAPRevertOnFailure=false", async function () {
      // Set UAPRevertOnFailure to false
      const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
      await universalProfile.setData(revertOnFailureKey, erc725UAP.encodeValueType("bool", false));
      
      // Configure a bad assistant that will fail
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [mockBadAssistant.target]));

      // Send LYX - should emit ExecutionResult with false
      await expect(sendLYX("1"))
        .to.emit(universalReceiverDelegateUAP, "ExecutionResult")
        .withArgs(LSP1_TYPE_IDS.LSP0ValueReceived, universalProfile.target, mockBadAssistant.target, false);
    });

    it("should continue to next assistant after one fails when UAPRevertOnFailure=false", async function () {
      // Set UAPRevertOnFailure to false
      const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
      await universalProfile.setData(revertOnFailureKey, erc725UAP.encodeValueType("bool", false));
      
      // Configure both a bad assistant and tip assistant
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [mockBadAssistant.target, tipAssistant.target]));
      
      // Configure tip assistant
      const tipExecKey = erc725UAP.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [LSP1_TYPE_IDS.LSP0ValueReceived, "1"]);
      const tipRecipient = await lsp7Holder.getAddress();
      const encodedTipConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [tipRecipient, 50]);
      const encodedTipExecData = encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [tipAssistant.target, encodedTipConfig]);
      await universalProfile.setData(tipExecKey, encodedTipExecData);

      const upAddr = universalProfile.target;
      const tipAddr = tipRecipient;
      const upBefore = await ethers.provider.getBalance(upAddr);
      const tipBefore = await ethers.provider.getBalance(tipAddr);

      // Send LYX - should fail on first assistant but succeed on second
      const tx = await sendLYX("1");
      await expect(tx)
        .to.emit(universalReceiverDelegateUAP, "ExecutionResult")
        .withArgs(LSP1_TYPE_IDS.LSP0ValueReceived, universalProfile.target, mockBadAssistant.target, false);
      await expect(tx)
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(universalProfile.target, tipAssistant.target);

      // Verify tip was processed despite first assistant failing
      expect(await ethers.provider.getBalance(upAddr)).to.equal(upBefore + ethers.parseEther("0.5"));
      expect(await ethers.provider.getBalance(tipAddr)).to.equal(tipBefore + ethers.parseEther("0.5"));
    });
  });

  describe("UAPRevertOnFailure=true (strict behavior)", function () {
    it("should revert on assistant failure when UAPRevertOnFailure=true", async function () {
      // Set UAPRevertOnFailure to true
      const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
      await universalProfile.setData(revertOnFailureKey, erc725UAP.encodeValueType("bool", true));
      
      // Configure a bad assistant that will fail
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [mockBadAssistant.target]));

      // Send LYX - should revert
      await expect(sendLYX("1")).to.be.reverted;
    });

    it("should propagate custom errors when UAPRevertOnFailure=true and assistant has custom error", async function () {
      // Set UAPRevertOnFailure to true
      const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
      await universalProfile.setData(revertOnFailureKey, erc725UAP.encodeValueType("bool", true));
      
      // Configure tip assistant without config (will throw TipConfigNotSet)
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [tipAssistant.target]));

      // Send LYX - should revert with custom error
      await expect(sendLYX("1")).to.be.revertedWithCustomError(tipAssistant, "TipConfigNotSet");
    });

    it("should propagate MockBadAssistant custom error when UAPRevertOnFailure=true", async function () {
      // Set UAPRevertOnFailure to true
      const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
      await universalProfile.setData(revertOnFailureKey, erc725UAP.encodeValueType("bool", true));
      
      // Configure a bad assistant that will fail with AlwaysFalseError
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [mockBadAssistant.target]));

      // Send LYX - should revert with AlwaysFalseError
      await expect(sendLYX("1"))
        .to.be.revertedWithCustomError(mockBadAssistant, "AlwaysFalseError");
    });

    it("should not continue to next assistant when one fails and UAPRevertOnFailure=true", async function () {
      // Set UAPRevertOnFailure to true
      const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
      await universalProfile.setData(revertOnFailureKey, erc725UAP.encodeValueType("bool", true));
      
      // Configure both a bad assistant and tip assistant
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [mockBadAssistant.target, tipAssistant.target]));
      
      // Configure tip assistant
      const tipExecKey = erc725UAP.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [LSP1_TYPE_IDS.LSP0ValueReceived, "1"]);
      const tipRecipient = await lsp7Holder.getAddress();
      const encodedTipConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [tipRecipient, 50]);
      const encodedTipExecData = encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [tipAssistant.target, encodedTipConfig]);
      await universalProfile.setData(tipExecKey, encodedTipExecData);

      const upAddr = universalProfile.target;
      const tipAddr = tipRecipient;
      const upBefore = await ethers.provider.getBalance(upAddr);
      const tipBefore = await ethers.provider.getBalance(tipAddr);

      // Send LYX - should revert on first assistant, never reaching second
      await expect(sendLYX("1")).to.be.reverted;

      // Verify no tip was processed
      expect(await ethers.provider.getBalance(upAddr)).to.equal(upBefore);
      expect(await ethers.provider.getBalance(tipAddr)).to.equal(tipBefore);
    });
  });

  describe("Boolean decoding edge cases", function () {
    it("should default to false when UAPRevertOnFailure data is empty", async function () {
      // Don't set UAPRevertOnFailure at all
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [mockBadAssistant.target]));

      // Should behave as false (continue on failure)
      const upAddr = universalProfile.target;
      const initialBalance = await ethers.provider.getBalance(upAddr);
      await expect(sendLYX("1")).to.not.be.reverted;
      expect(await ethers.provider.getBalance(upAddr)).to.equal(initialBalance + ethers.parseEther("1"));
    });

    it("should handle UAPRevertOnFailure=true with 0x01 encoding", async function () {
      // Set UAPRevertOnFailure to true using raw bytes
      const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
      await universalProfile.setData(revertOnFailureKey, "0x01");
      
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [mockBadAssistant.target]));

      // Should revert
      await expect(sendLYX("1")).to.be.reverted;
    });

    it("should handle UAPRevertOnFailure=false with 0x00 encoding", async function () {
      // Set UAPRevertOnFailure to false using raw bytes
      const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
      await universalProfile.setData(revertOnFailureKey, "0x00");
      
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [mockBadAssistant.target]));

      // Should not revert
      const upAddr = universalProfile.target;
      const initialBalance = await ethers.provider.getBalance(upAddr);
      await expect(sendLYX("1")).to.not.be.reverted;
      expect(await ethers.provider.getBalance(upAddr)).to.equal(initialBalance + ethers.parseEther("1"));
    });
  });

  describe("Successful execution behavior", function () {
    it("should work normally when UAPRevertOnFailure=true but assistants succeed", async function () {
      // Set UAPRevertOnFailure to true
      const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
      await universalProfile.setData(revertOnFailureKey, erc725UAP.encodeValueType("bool", true));
      
      // Configure tip assistant with proper config
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [tipAssistant.target]));
      
      const tipExecKey = erc725UAP.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [LSP1_TYPE_IDS.LSP0ValueReceived, "0"]);
      const tipRecipient = await lsp7Holder.getAddress();
      const encodedTipConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [tipRecipient, 50]);
      const encodedTipExecData = encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [tipAssistant.target, encodedTipConfig]);
      await universalProfile.setData(tipExecKey, encodedTipExecData);

      const upAddr = universalProfile.target;
      const tipAddr = tipRecipient;
      const upBefore = await ethers.provider.getBalance(upAddr);
      const tipBefore = await ethers.provider.getBalance(tipAddr);

      // Send LYX - should work normally
      const tx = await sendLYX("1");
      await expect(tx).to.emit(universalReceiverDelegateUAP, "AssistantInvoked").withArgs(upAddr, tipAssistant.target);

      // Verify tip was processed
      expect(await ethers.provider.getBalance(upAddr)).to.equal(upBefore + ethers.parseEther("0.5"));
      expect(await ethers.provider.getBalance(tipAddr)).to.equal(tipBefore + ethers.parseEther("0.5"));
    });

    it("should work normally when UAPRevertOnFailure=false and assistants succeed", async function () {
      // Set UAPRevertOnFailure to false
      const revertOnFailureKey = erc725UAP.encodeKeyName("UAPRevertOnFailure");
      await universalProfile.setData(revertOnFailureKey, erc725UAP.encodeValueType("bool", false));
      
      // Configure tip assistant with proper config
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP0ValueReceived]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [tipAssistant.target]));
      
      const tipExecKey = erc725UAP.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [LSP1_TYPE_IDS.LSP0ValueReceived, "0"]);
      const tipRecipient = await lsp7Holder.getAddress();
      const encodedTipConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [tipRecipient, 50]);
      const encodedTipExecData = encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [tipAssistant.target, encodedTipConfig]);
      await universalProfile.setData(tipExecKey, encodedTipExecData);

      const upAddr = universalProfile.target;
      const tipAddr = tipRecipient;
      const upBefore = await ethers.provider.getBalance(upAddr);
      const tipBefore = await ethers.provider.getBalance(tipAddr);

      // Send LYX - should work normally
      const tx = await sendLYX("1");
      await expect(tx).to.emit(universalReceiverDelegateUAP, "AssistantInvoked").withArgs(upAddr, tipAssistant.target);

      // Verify tip was processed
      expect(await ethers.provider.getBalance(upAddr)).to.equal(upBefore + ethers.parseEther("0.5"));
      expect(await ethers.provider.getBalance(tipAddr)).to.equal(tipBefore + ethers.parseEther("0.5"));
    });
  });
});