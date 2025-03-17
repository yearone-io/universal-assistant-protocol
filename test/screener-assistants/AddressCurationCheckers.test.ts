import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { LSP1_TYPE_IDS } from "@lukso/lsp-smart-contracts";
import {
  UniversalReceiverDelegateUAP,
  SafeAssetAllowlistScreener,
  SafeAssetCurationScreener,
  ForwarderAssistant,
} from "../../typechain-types";
import {
  customEncodeAddresses,
  deployUniversalProfile,
  deployMockAssets,
  setScreenerConfig,
  setExecutiveConfig,
  generateMappingKey,
  addressToBytes32,
  generateListMappingKey,
  setListEntry,
} from "../utils/TestUtils";

describe("Screeners: Address and Curation Checkers", function () {
  let owner: Signer;
  let browserController: Signer;
  let lsp7Holder: Signer;
  let nonOwner: Signer;
  let universalProfile: any;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let addressListChecker: SafeAssetAllowlistScreener;
  let curationChecker: SafeAssetCurationScreener;
  let forwarderAssistant: ForwarderAssistant;
  let mockLSP7A: any;
  let mockLSP7B: any;
  let mockLSP8: any;

  const LSP7_TYPEID = LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification;

  beforeEach(async function () {
    [owner, browserController, lsp7Holder, nonOwner] = await ethers.getSigners();
    ({ universalProfile, universalReceiverDelegateUAP } = await deployUniversalProfile(owner, browserController));
    ({ lsp7: mockLSP7A } = await deployMockAssets(lsp7Holder));
    ({ lsp7: mockLSP7B, lsp8: mockLSP8 } = await deployMockAssets(lsp7Holder));

    const SafeAssetAllowlistScreenerFactory = await ethers.getContractFactory("SafeAssetAllowlistScreener");
    addressListChecker = await SafeAssetAllowlistScreenerFactory.deploy();
    const SafeAssetCurationScreenerFactory = await ethers.getContractFactory("SafeAssetCurationScreener");
    curationChecker = await SafeAssetCurationScreenerFactory.deploy();
    const ForwarderFactory = await ethers.getContractFactory("ForwarderAssistant");
    forwarderAssistant = await ForwarderFactory.deploy();
  });

  describe("SafeAssetAllowlistScreener", function () {
    it("should allow transaction when notifier is in allowlist and returnValueWhenAllowed is true", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await addressListChecker.getAddress();

      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAddress]));

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
      await setScreenerConfig(universalProfile, forwarderAddress, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      await setListEntry(universalProfile, forwarderAddress, screenerAddress, lsp7Address, true);
      await setExecutiveConfig(universalProfile, forwarderAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 69))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddress, forwarderAddress)
        .to.emit(addressListChecker, "AllowlistEntryUpdated")
        .withArgs(forwarderAddress, screenerAddress, lsp7Address, true);
      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(69);
    });

    it("should block transaction when notifier is not in allowlist", async function () {
      const upAddress = await universalProfile.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await addressListChecker.getAddress();

      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAddress]));

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
      await setScreenerConfig(universalProfile, forwarderAddress, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      await setExecutiveConfig(universalProfile, forwarderAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 69))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(69);
    });

    it("should block transaction when no config is set", async function () {
      const upAddress = await universalProfile.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await addressListChecker.getAddress();

      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAddress]));

      await setScreenerConfig(universalProfile, forwarderAddress, [screenerAddress], LSP7_TYPEID, ["0x"]);
      await setExecutiveConfig(universalProfile, forwarderAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 69))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(69);
    });

    it("should block transaction when returnValueWhenAllowed is false despite being in allowlist", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await addressListChecker.getAddress();

      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAddress]));

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [false]);
      await setScreenerConfig(universalProfile, forwarderAddress, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      await setListEntry(universalProfile, forwarderAddress, screenerAddress, lsp7Address, true);
      await setExecutiveConfig(universalProfile, forwarderAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 69))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(69);
    });
  });

  describe("SafeAssetCurationScreener", function () {
    it("should allow transaction when notifier is in curated LSP8 list and not blocked", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const curatedListAddress = await mockLSP8.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await curationChecker.getAddress();

      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAddress]));

      const curatedEntryId = addressToBytes32(lsp7Address);
      await mockLSP8.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, true]);
      await setScreenerConfig(universalProfile, forwarderAddress, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      await setExecutiveConfig(universalProfile, forwarderAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 1))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddress, forwarderAddress);
      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(1);
    });

    it("should block transaction when notifier is in blocklist despite being curated", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const curatedListAddress = await mockLSP8.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await curationChecker.getAddress();

      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAddress]));

      const curatedEntryId = addressToBytes32(lsp7Address);
      await mockLSP8.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, true]);
      await setScreenerConfig(universalProfile, forwarderAddress, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      await setListEntry(universalProfile, forwarderAddress, screenerAddress, lsp7Address, true); // Add to blocklist
      await setExecutiveConfig(universalProfile, forwarderAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 1))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .to.emit(curationChecker, "BlocklistEntryUpdated")
        .withArgs(forwarderAddress, screenerAddress, lsp7Address, true);
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(1);
    });

    it("should block transaction when notifier is not in curated LSP8 list", async function () {
      const upAddress = await universalProfile.getAddress();
      const curatedListAddress = await mockLSP8.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await curationChecker.getAddress();

      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAddress]));

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, true]);
      await setScreenerConfig(universalProfile, forwarderAddress, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      await setExecutiveConfig(universalProfile, forwarderAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7B.connect(lsp7Holder).mint(upAddress, 1))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7B.balanceOf(upAddress)).to.equal(1);
    });

    it("should block transaction when no curated list is configured", async function () {
      const upAddress = await universalProfile.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await curationChecker.getAddress();

      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAddress]));

      await setScreenerConfig(universalProfile, forwarderAddress, [screenerAddress], LSP7_TYPEID, ["0x"]);
      await setExecutiveConfig(universalProfile, forwarderAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 1))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(1);
    });

    it("should block transaction when returnValueWhenCurated is false despite being curated", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const curatedListAddress = await mockLSP8.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await curationChecker.getAddress();

      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAddress]));

      const curatedEntryId = addressToBytes32(lsp7Address);
      await mockLSP8.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, false]);
      await setScreenerConfig(universalProfile, forwarderAddress, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      await setExecutiveConfig(universalProfile, forwarderAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 1))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(1);
    });
  });
});