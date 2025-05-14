import { ethers } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";
import { LSP1_TYPE_IDS } from "@lukso/lsp-smart-contracts";
import {
  ForwarderAssistant,
  MockAssistant,
  MockBadAssistant,
  UniversalReceiverDelegateUAP,
} from "../../typechain-types";
import { deployUniversalProfile, deployMockAssets, setExecutiveConfig } from "../utils/TestUtils";
import ERC725, { ERC725JSONSchema } from "@erc725/erc725.js";
import uap from '../../schemas/UAP.json';

describe("UniversalReceiverDelegateUAP Core", function () {
  let owner: Signer;
  let browserController: Signer;
  let nonOwner: Signer;
  let lsp7Holder: Signer;
  let lsp8Holder: Signer;
  let universalProfile: any;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let mockAssistant: MockAssistant;
  let mockBadAssistant: MockBadAssistant;
  let forwarderAssistant: ForwarderAssistant;
  let mockLSP7: any;
  let mockLSP8: any;
  let erc725UAP: ERC725;

  beforeEach(async function () {
    [owner, browserController, nonOwner, lsp7Holder, lsp8Holder] = await ethers.getSigners();
    ({ universalProfile, universalReceiverDelegateUAP } = await deployUniversalProfile(owner, browserController));
    ({ lsp7: mockLSP7, lsp8: mockLSP8 } = await deployMockAssets(lsp7Holder));
    erc725UAP = new ERC725(uap as ERC725JSONSchema[], universalProfile.target, ethers.provider);

    const MockAssistantFactory = await ethers.getContractFactory("MockAssistant");
    mockAssistant = await MockAssistantFactory.deploy();
    const MockBadAssistantFactory = await ethers.getContractFactory("MockBadAssistant");
    mockBadAssistant = await MockBadAssistantFactory.deploy();
    const ForwarderAssistantFactory = await ethers.getContractFactory("ForwarderAssistant");
    forwarderAssistant = await ForwarderAssistantFactory.deploy();
  });

  describe("universalReceiverDelegate", function () {
    it("should proceed with super function if no type configuration is found", async function () {
      const amount = 1;
      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, amount);
      await mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, amount, true, "0x");
      expect(await mockLSP7.balanceOf(universalProfile.target)).to.equal(amount);
    });

    it("should proceed with super function if type configuration is found but no assistants are found", async function () {
      const typeMappingKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification]);
      await universalProfile.setData(typeMappingKey, erc725UAP.encodeValueType("address[]", []));
      const amount = 1;
      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, amount);
      await mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, amount, true, "0x");
      expect(await mockLSP7.balanceOf(universalProfile.target)).to.equal(amount);
    });

    it("should invoke executive assistants when they are found", async function () {
      const typeMappingKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification]);
      await universalProfile.setData(typeMappingKey, erc725UAP.encodeValueType("address[]", [mockAssistant.target]));
      const amount = 1;
      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, amount);
      await expect(
        mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, amount, true, "0x")
      ).to.emit(universalReceiverDelegateUAP, "AssistantInvoked").withArgs(universalProfile.target, mockAssistant.target);
    });

    it("should handle executive call failures through revert", async function () {
      const typeMappingKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification]);
      await universalProfile.setData(typeMappingKey, erc725UAP.encodeValueType("address[]", [mockBadAssistant.target]));
      const amount = 1;
      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, amount);
      await expect(
        mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, amount, true, "0x")
      ).to.be.revertedWithCustomError(mockBadAssistant, "AlwaysFalseError");
    });

    it("should forward LSP7 tokens to the target address using the ForwarderAssistant", async function () {
      const typeMappingKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification]);
      await universalProfile.setData(typeMappingKey, erc725UAP.encodeValueType("address[]", [forwarderAssistant.target]));
      const targetAddress = await nonOwner.getAddress();
      const encodedInstructions = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [targetAddress]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAssistant.target,
        LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification,
        0,
        encodedInstructions
      );

      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, 1);
      await mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, 1, true, "0x");
      expect(await mockLSP7.balanceOf(targetAddress)).to.equal(1);
    });
  });

  describe("Security Features", function () {
    let mockTrueScreenerAssistant: any;
    let mockFalseScreenerAssistant: any;
    
    beforeEach(async function () {
      const MockTrueScreenerAssistantFactory = await ethers.getContractFactory("MockTrueScreenerAssistant");
      mockTrueScreenerAssistant = await MockTrueScreenerAssistantFactory.deploy();
      
      const MockFalseScreenerAssistantFactory = await ethers.getContractFactory("MockFalseScreenerAssistant");
      mockFalseScreenerAssistant = await MockFalseScreenerAssistantFactory.deploy();
    });

    it("should reject unverified screener assistants", async function () {
      const typeMappingKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification]);
      await universalProfile.setData(typeMappingKey, erc725UAP.encodeValueType("address[]", [mockAssistant.target]));
      
      // Set up a screener but don't add it to verified list
      const screenersKey = erc725UAP.encodeKeyName("UAPExecutiveScreeners:<bytes32>:<address>", 
        [LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification, mockAssistant.target]);
      await universalProfile.setData(screenersKey, erc725UAP.encodeValueType("address[]", [mockTrueScreenerAssistant.target]));
      
      // Transfer should still work, but screener is skipped since it's not verified
      const amount = 1;
      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, amount);
      await expect(
        mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, amount, true, "0x")
      ).to.emit(universalReceiverDelegateUAP, "ScreenerVerificationFailed").withArgs(mockTrueScreenerAssistant.target);
    });
    
    it("should validate operation types for exec operations", async function () {
      // This is tested by mocking an assistant that tries to return an invalid operation type
      const MockBadOperationTypeAssistantFactory = await ethers.getContractFactory("MockBadAssistant");
      const mockBadOperationTypeAssistant = await MockBadOperationTypeAssistantFactory.deploy();
      await mockBadOperationTypeAssistant.setBadOperationType(9999); // Invalid operation type
      
      const typeMappingKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification]);
      await universalProfile.setData(typeMappingKey, erc725UAP.encodeValueType("address[]", [mockBadOperationTypeAssistant.target]));
      
      const amount = 1;
      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, amount);
      await expect(
        mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, amount, true, "0x")
      ).to.be.revertedWithCustomError(universalReceiverDelegateUAP, "InvalidOperationType");
    });
    
    it("should handle invalid encoded data safely", async function () {
      // Set up invalid encoded data
      const typeMappingKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification]);
      await universalProfile.setData(typeMappingKey, "0x1234"); // Invalid encoding
      
      const amount = 1;
      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, amount);
      
      // Should revert with InvalidEncodedData
      await expect(
        mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, amount, true, "0x")
      ).to.be.revertedWithCustomError(universalReceiverDelegateUAP, "InvalidEncodedData");
    });
  });
});