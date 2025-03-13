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
import { customEncodeAddresses, deployUniversalProfile, deployMockAssets, generateMappingKey } from "../utils/TestUtils";

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

  beforeEach(async function () {
    [owner, browserController, nonOwner, lsp7Holder, lsp8Holder] = await ethers.getSigners();
    ({ universalProfile, universalReceiverDelegateUAP } = await deployUniversalProfile(owner, browserController));
    ({ lsp7: mockLSP7, lsp8: mockLSP8 } = await deployMockAssets(lsp7Holder));

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
      const typeMappingKey = generateMappingKey("UAPTypeConfig", LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification);
      await universalProfile.setData(typeMappingKey, customEncodeAddresses([]));
      const amount = 1;
      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, amount);
      await mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, amount, true, "0x");
      expect(await mockLSP7.balanceOf(universalProfile.target)).to.equal(amount);
    });

    it("should invoke executive assistants when they are found", async function () {
      const typeMappingKey = generateMappingKey("UAPTypeConfig", LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification);
      await universalProfile.setData(typeMappingKey, customEncodeAddresses([mockAssistant.target]));
      const amount = 1;
      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, amount);
      await expect(
        mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, amount, true, "0x")
      ).to.emit(universalReceiverDelegateUAP, "AssistantInvoked").withArgs(universalProfile.target, mockAssistant.target);
    });

    it("should handle executive call failures through revert", async function () {
      const typeMappingKey = generateMappingKey("UAPTypeConfig", LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification);
      await universalProfile.setData(typeMappingKey, customEncodeAddresses([mockBadAssistant.target]));
      const amount = 1;
      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, amount);
      await expect(
        mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, amount, true, "0x")
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
      const typeMappingKey = generateMappingKey("UAPTypeConfig", LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification);
      await universalProfile.setData(typeMappingKey, customEncodeAddresses([forwarderAssistant.target]));
      const assistantInstructionsKey = generateMappingKey("UAPExecutiveConfig", forwarderAssistant.target);
      const targetAddress = await nonOwner.getAddress();
      const encodedInstructions = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [targetAddress]);
      await universalProfile.setData(assistantInstructionsKey, encodedInstructions);

      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, 1);
      await mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, 1, true, "0x");
      expect(await mockLSP7.balanceOf(targetAddress)).to.equal(1);
    });
  });
});