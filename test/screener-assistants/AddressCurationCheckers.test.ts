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
  deployUniversalProfile,
  deployMockAssets,
  setScreenerConfig,
  setExecutiveConfig,
  addressToBytes32,
  setListEntry,
  getListSet,
} from "../utils/TestUtils";
import ERC725, { ERC725JSONSchema } from "@erc725/erc725.js";
import uap from '../../schemas/UAP.json';

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
  let erc725UAP: ERC725;

  const LSP7_TYPEID = LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification;

  beforeEach(async function () {
    [owner, browserController, lsp7Holder, nonOwner] = await ethers.getSigners();
    ({ universalProfile, universalReceiverDelegateUAP } = await deployUniversalProfile(owner, browserController));
    ({ lsp7: mockLSP7A } = await deployMockAssets(lsp7Holder));
    ({ lsp7: mockLSP7B, lsp8: mockLSP8 } = await deployMockAssets(lsp7Holder));
    erc725UAP = new ERC725(uap as ERC725JSONSchema[], universalProfile.target, ethers.provider);

    const SafeAssetAllowlistScreenerFactory = await ethers.getContractFactory("SafeAssetAllowlistScreener");
    addressListChecker = await SafeAssetAllowlistScreenerFactory.deploy();
    const SafeAssetCurationScreenerFactory = await ethers.getContractFactory("SafeAssetCurationScreener");
    curationChecker = await SafeAssetCurationScreenerFactory.deploy();
    const ForwarderFactory = await ethers.getContractFactory("ForwarderAssistant");
    forwarderAssistant = await ForwarderFactory.deploy();
  });

  describe("SafeAssetAllowlistScreener", function () {
    it("should engage executive when notifier is in allowlist and returnValueWhenAllowed is true", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await addressListChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      await setListEntry(universalProfile, forwarderAddress, screenerAddress, lsp7Address, true);
      const list = await getListSet(universalProfile, forwarderAddress, screenerAddress);
      expect(list).to.include(lsp7Address);
      expect(list).to.have.lengthOf(1);
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAddress,
        LSP7_TYPEID,
        0,
        encodedExecConfig
      );

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 69))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddress, forwarderAddress);
      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(69);
      await setListEntry(universalProfile, forwarderAddress, screenerAddress, lsp7Address, false);
      const listAfter = await getListSet(universalProfile, forwarderAddress, screenerAddress);
      expect(listAfter).to.have.length(0);
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 69))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
    });

    it("should NOT engage executive when notifier is in allowlist and returnValueWhenAllowed is false", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await addressListChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [false]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      await setListEntry(universalProfile, forwarderAddress, screenerAddress, lsp7Address, true);
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAddress,
        LSP7_TYPEID,
        0,
        encodedExecConfig
      );

      const upBalanceBefore = await mockLSP7A.balanceOf(upAddress);
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 69))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(upBalanceBefore + BigInt(69));
    });

    it("should block transaction when notifier is not in allowlist", async function () {
      const upAddress = await universalProfile.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await addressListChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAddress,
        LSP7_TYPEID,
        0,
        encodedExecConfig
      );

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 69))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(69);
    });

    it("should block transaction when no config is set", async function () {
      const upAddress = await universalProfile.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await addressListChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, ["0x"]);
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAddress,
        LSP7_TYPEID,
        0,
        encodedExecConfig
      );

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

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      const curatedEntryId = addressToBytes32(lsp7Address);
      await mockLSP8.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAddress,
        LSP7_TYPEID,
        0,
        encodedExecConfig
      );

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 1))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddress, forwarderAddress);
      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(1);
    });

    it("should block transaction when notifier is in blocklist despite being curated", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const lsp7BAddress = await mockLSP7B.getAddress()
      const curatedListAddress = await mockLSP8.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await curationChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      const curatedEntryId = addressToBytes32(lsp7Address);
      await mockLSP8.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      await setListEntry(universalProfile, forwarderAddress, screenerAddress, lsp7Address, true); // Add to blocklist
      await setListEntry(universalProfile, forwarderAddress, screenerAddress, lsp7BAddress, true);
      const list = await getListSet(universalProfile, forwarderAddress, screenerAddress);
      expect(list).to.include(lsp7Address);
      expect(list).to.include(lsp7BAddress);
      expect(list).to.have.lengthOf(2);
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAddress,
        LSP7_TYPEID,
        0,
        encodedExecConfig
      );

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 1))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(1);
    });

    it("should block transaction when notifier is not in curated LSP8 list", async function () {
      const upAddress = await universalProfile.getAddress();
      const curatedListAddress = await mockLSP8.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await curationChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAddress,
        LSP7_TYPEID,
        0,
        encodedExecConfig
      );

      await expect(mockLSP7B.connect(lsp7Holder).mint(upAddress, 1))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7B.balanceOf(upAddress)).to.equal(1);
    });

    it("should block transaction when no curated list is configured", async function () {
      const upAddress = await universalProfile.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await curationChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, ["0x"]);
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAddress,
        LSP7_TYPEID,
        0,
        encodedExecConfig
      );

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

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      const curatedEntryId = addressToBytes32(lsp7Address);
      await mockLSP8.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, false]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAddress,
        LSP7_TYPEID,
        0,
        encodedExecConfig
      );

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 1))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(1);
    });
  });

  describe("Chained Screeners: SafeAssetAllowlistScreener and SafeAssetCurationScreener", function () {
    it("should engage executive when notifier passes both screeners (AND chain)", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const curatedListAddress = await mockLSP8.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const allowlistScreenerAddress = await addressListChecker.getAddress();
      const curationScreenerAddress = await curationChecker.getAddress();

      // Set type config
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      // Configure Allowlist Screener
      const allowlistConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
      // Configure Curation Screener
      const curationConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, true]);
      await setScreenerConfig(erc725UAP, 
        universalProfile,
        forwarderAddress,
        0,
        [allowlistScreenerAddress, curationScreenerAddress],
        LSP7_TYPEID,
        [allowlistConfig, curationConfig],
        true // isAndChain = true
      );

      // Add to allowlist
      await setListEntry(universalProfile, forwarderAddress, allowlistScreenerAddress, lsp7Address, true);
      // Add to curated list
      const curatedEntryId = addressToBytes32(lsp7Address);
      await mockLSP8.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);
      // Set executive
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAddress,
        LSP7_TYPEID,
        0,
        encodedExecConfig
      );

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 1))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddress, forwarderAddress);
      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(1);
    });

    it("should block transaction when notifier passes allowlist but not curation (AND chain)", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const curatedListAddress = await mockLSP8.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const allowlistScreenerAddress = await addressListChecker.getAddress();
      const curationScreenerAddress = await curationChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      const allowlistConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
      const curationConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, true]);
      await setScreenerConfig(erc725UAP, 
        universalProfile,
        forwarderAddress,
        0,
        [allowlistScreenerAddress, curationScreenerAddress],
        LSP7_TYPEID,
        [allowlistConfig, curationConfig],
        true // isAndChain = true
      );

      // Add to allowlist but not curated list
      await setListEntry(universalProfile, forwarderAddress, allowlistScreenerAddress, lsp7Address, true);
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAddress,
        LSP7_TYPEID,
        0,
        encodedExecConfig
      );

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 1))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(1);
    });

    it("should block transaction when notifier passes curation but not allowlist (AND chain)", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const curatedListAddress = await mockLSP8.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const allowlistScreenerAddress = await addressListChecker.getAddress();
      const curationScreenerAddress = await curationChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      const allowlistConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
      const curationConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, true]);
      await setScreenerConfig(erc725UAP, 
        universalProfile,
        forwarderAddress,
        0,
        [allowlistScreenerAddress, curationScreenerAddress],
        LSP7_TYPEID,
        [allowlistConfig, curationConfig],
        true // isAndChain = true
      );

      // Add to curated list but not allowlist
      const curatedEntryId = addressToBytes32(lsp7Address);
      await mockLSP8.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAddress,
        LSP7_TYPEID,
        0,
        encodedExecConfig
      );

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 1))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(1);
    });

    it("should block transaction when notifier is in blocklist despite passing both screeners (AND chain)", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const curatedListAddress = await mockLSP8.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const allowlistScreenerAddress = await addressListChecker.getAddress();
      const curationScreenerAddress = await curationChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      const allowlistConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
      const curationConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, true]);
      await setScreenerConfig(erc725UAP, 
        universalProfile,
        forwarderAddress,
        0,
        [allowlistScreenerAddress, curationScreenerAddress],
        LSP7_TYPEID,
        [allowlistConfig, curationConfig],
        true // isAndChain = true
      );

      // Add to allowlist and curated list
      await setListEntry(universalProfile, forwarderAddress, allowlistScreenerAddress, lsp7Address, true);
      const curatedEntryId = addressToBytes32(lsp7Address);
      await mockLSP8.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);
      // Add to blocklist
      await setListEntry(universalProfile, forwarderAddress, curationScreenerAddress, lsp7Address, true);
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAddress,
        LSP7_TYPEID,
        0,
        encodedExecConfig
      );

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 1))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(1);
    });

    it("should engage executive when notifier passes curation but not allowlist (OR chain)", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const curatedListAddress = await mockLSP8.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const allowlistScreenerAddress = await addressListChecker.getAddress();
      const curationScreenerAddress = await curationChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      const allowlistConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
      const curationConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, true]);
      await setScreenerConfig(erc725UAP, 
        universalProfile,
        forwarderAddress,
        0,
        [allowlistScreenerAddress, curationScreenerAddress],
        LSP7_TYPEID,
        [allowlistConfig, curationConfig],
        false // isAndChain = false (OR)
      );

      // Add to curated list but not allowlist
      const curatedEntryId = addressToBytes32(lsp7Address);
      await mockLSP8.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAddress,
        LSP7_TYPEID,
        0,
        encodedExecConfig
      );

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 1))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddress, forwarderAddress);
      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(1);
    });
  });
});