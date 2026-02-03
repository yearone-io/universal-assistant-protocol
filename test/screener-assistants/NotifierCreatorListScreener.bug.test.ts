import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { LSP1_TYPE_IDS, INTERFACE_IDS } from "@lukso/lsp-smart-contracts";
import {
  UniversalReceiverDelegateUAP,
  NotifierCreatorListScreener,
  ForwarderAssistant,
  UniversalProfile,
  MockLSP7WithoutERC725Y,
  MockLSP8WithoutERC725Y,
} from "../../typechain-types";
import {
  deployUniversalProfile,
  deployMockAssets,
  setScreenerConfig,
  setExecutiveConfig,
  mergeListEntry,
  setListNameOnScreener,
  setLSP4Creators,
  setLSP12IssuedAssets,
} from "../utils/TestUtils";
import ERC725, { ERC725JSONSchema } from "@erc725/erc725.js";
import UAPSchema from '../../schemas/UAP.json';
import GRAVEAllowlistSchema from '../../schemas/GRAVEAllowlist.json';

describe("NotifierCreatorListScreener - Bug Tests & Creator Fetching", function () {
  const allowlistName = "CreatorAllowlist";
  const LSP7_TYPEID = LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification;
  const LSP8_TYPEID = LSP1_TYPE_IDS.LSP8Tokens_RecipientNotification;

  let owner: Signer;
  let browserController: Signer;
  let lsp7Holder: Signer;
  let lsp8Holder: Signer;
  let creator1: Signer;
  let creator1Controller: Signer;
  let creator2: Signer;
  let creator2Controller: Signer;
  let creator3: Signer;
  let creator3Controller: Signer;
  let forwardee: Signer;
  let universalProfile: UniversalProfile;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let creatorListScreener: NotifierCreatorListScreener;
  let forwarderAssistant: ForwarderAssistant;
  let mockLSP7: any;
  let mockLSP8: any;
  let mockLSP7WithoutERC725Y: MockLSP7WithoutERC725Y;
  let mockLSP8WithoutERC725Y: MockLSP8WithoutERC725Y;
  let creatorProfile1: UniversalProfile;
  let creatorProfile2: UniversalProfile;
  let creatorProfile3: UniversalProfile;
  let erc725UAP: ERC725;

  beforeEach(async function () {
    [
      owner,
      browserController,
      lsp7Holder,
      lsp8Holder,
      creator1,
      creator1Controller,
      creator2,
      creator2Controller,
      creator3,
      creator3Controller,
      forwardee
    ] = await ethers.getSigners();

    // Deploy main UP
    ({ universalProfile, universalReceiverDelegateUAP } = await deployUniversalProfile(owner, browserController));

    // Deploy creator profiles
    ({ universalProfile: creatorProfile1 } = await deployUniversalProfile(creator1, creator1Controller));
    ({ universalProfile: creatorProfile2 } = await deployUniversalProfile(creator2, creator2Controller));
    ({ universalProfile: creatorProfile3 } = await deployUniversalProfile(creator3, creator3Controller));

    // Deploy real LSP7/LSP8 with ERC725Y support
    ({ lsp7: mockLSP7, lsp8: mockLSP8 } = await deployMockAssets(lsp7Holder));

    // Deploy LSP7/LSP8 WITHOUT ERC725Y support
    const MockLSP7WithoutERC725YFactory = await ethers.getContractFactory("MockLSP7WithoutERC725Y");
    mockLSP7WithoutERC725Y = await MockLSP7WithoutERC725YFactory.deploy(
      "Mock LSP7 No ERC725Y",
      "MLSP7N",
      await lsp7Holder.getAddress()
    );

    const MockLSP8WithoutERC725YFactory = await ethers.getContractFactory("MockLSP8WithoutERC725Y");
    mockLSP8WithoutERC725Y = await MockLSP8WithoutERC725YFactory.deploy(
      "Mock LSP8 No ERC725Y",
      "MLSP8N",
      await lsp8Holder.getAddress()
    );

    erc725UAP = new ERC725([
      ...UAPSchema,
      ...GRAVEAllowlistSchema
    ] as ERC725JSONSchema[], universalProfile.target, ethers.provider);

    // Deploy screener and assistant
    const NotifierCreatorListScreenerFactory = await ethers.getContractFactory("NotifierCreatorListScreener");
    creatorListScreener = await NotifierCreatorListScreenerFactory.deploy();
    const ForwarderFactory = await ethers.getContractFactory("ForwarderAssistant");
    forwarderAssistant = await ForwarderFactory.deploy();
  });

  describe("Bug Replication (Tokens without ERC725Y)", function () {
    it("should handle LSP7 without getData() gracefully (no revert)", async function () {
      const upAddress = await universalProfile.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();
      const forwardeeAddress = await forwardee.getAddress();

      // Configure UAP with ForwarderAssistant + CreatorListScreener
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      // Config: requireAllCreators=true, returnValueWhenInList=true
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [forwardeeAddress]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Mint token WITHOUT ERC725Y - should NOT revert
      // Token has no getData() method, so screener should handle gracefully
      await expect(mockLSP7WithoutERC725Y.connect(lsp7Holder).mint(upAddress, 100))
        .to.not.be.reverted;

      // Should NOT invoke ForwarderAssistant (no creators = fails screening)
      // Tokens should remain in the UP
      expect(await mockLSP7WithoutERC725Y.balanceOf(upAddress)).to.equal(100);
      expect(await mockLSP7WithoutERC725Y.balanceOf(forwardeeAddress)).to.equal(0);
    });

    it("should handle LSP8 without getData() gracefully (no revert)", async function () {
      const upAddress = await universalProfile.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();
      const forwardeeAddress = await forwardee.getAddress();

      // Configure UAP
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP8_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP8_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP8_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [forwardeeAddress]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP8_TYPEID, 0, encodedExecConfig);

      // Mint LSP8 token WITHOUT ERC725Y - should NOT revert
      const tokenId = ethers.solidityPackedKeccak256(["string"], ["token1"]);
      await expect(mockLSP8WithoutERC725Y.connect(lsp8Holder).mint(upAddress, tokenId))
        .to.not.be.reverted;

      // Should NOT invoke ForwarderAssistant (no creators = fails screening)
      expect(await mockLSP8WithoutERC725Y.tokenOwnerOf(tokenId)).to.equal(upAddress);
    });
  });

  describe("Creator Fetching Tests (Real LSP7/LSP8 with ERC725Y)", function () {
    it("should fetch creators from LSP7 with proper LSP4Creators[] metadata", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();
      const forwardeeAddress = await forwardee.getAddress();

      // Set up LSP4Creators[] on asset
      await setLSP4Creators(mockLSP7, [creator1Address], lsp7Holder);

      // Set up LSP12IssuedAssets[] on creator profile
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);

      // Add creator to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Configure UAP
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [forwardeeAddress]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Should successfully fetch creator, verify, and forward
      await expect(mockLSP7.connect(lsp7Holder).mint(upAddress, 100))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddress, forwarderAddress);

      // Tokens should be forwarded
      expect(await mockLSP7.balanceOf(forwardeeAddress)).to.equal(100);
    });

    it("should fetch multiple creators and verify all (requireAllCreators=true)", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const creator2Address = await creatorProfile2.getAddress();
      const creator3Address = await creatorProfile3.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();
      const forwardeeAddress = await forwardee.getAddress();

      // Set up LSP4Creators[] with 3 creators
      await setLSP4Creators(mockLSP7, [creator1Address, creator2Address, creator3Address], lsp7Holder);

      // Set up LSP12IssuedAssets[] on all creator profiles
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      await setLSP12IssuedAssets(creatorProfile2, [lsp7Address], creator2);
      await setLSP12IssuedAssets(creatorProfile3, [lsp7Address], creator3);

      // Add only creator1 to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Configure UAP with requireAllCreators=true
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]); // requireAllCreators=true
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [forwardeeAddress]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Should forward: all 3 creators verified, at least one (creator1) in list
      await expect(mockLSP7.connect(lsp7Holder).mint(upAddress, 100))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked");

      expect(await mockLSP7.balanceOf(forwardeeAddress)).to.equal(100);
    });

    it("should handle partial creator verification with requireAllCreators=false", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const creator2Address = await creatorProfile2.getAddress();
      const creator3Address = await creatorProfile3.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();
      const forwardeeAddress = await forwardee.getAddress();

      // Set up LSP4Creators[] with 3 creators
      await setLSP4Creators(mockLSP7, [creator1Address, creator2Address, creator3Address], lsp7Holder);

      // Only 2 creators verify issuance (creator2 does NOT)
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      // Skip creator2 - no LSP12IssuedAssets
      await setLSP12IssuedAssets(creatorProfile3, [lsp7Address], creator3);

      // Add creator1 to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Configure UAP with requireAllCreators=false
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [false, true]); // requireAllCreators=false
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [forwardeeAddress]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Should forward: creator1 verified AND in list (creator2 unverified is ignored)
      await expect(mockLSP7.connect(lsp7Holder).mint(upAddress, 100))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked");

      expect(await mockLSP7.balanceOf(forwardeeAddress)).to.equal(100);
    });

    it("should handle partial creator verification with requireAllCreators=true (should reject)", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const creator2Address = await creatorProfile2.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();
      const forwardeeAddress = await forwardee.getAddress();

      // Set up LSP4Creators[] with 2 creators
      await setLSP4Creators(mockLSP7, [creator1Address, creator2Address], lsp7Holder);

      // Only creator1 verifies issuance
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      // Skip creator2 - no LSP12IssuedAssets

      // Add creator1 to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Configure UAP with requireAllCreators=true
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]); // requireAllCreators=true
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [forwardeeAddress]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Should NOT forward: requireAllCreators=true but creator2 hasn't verified
      await expect(mockLSP7.connect(lsp7Holder).mint(upAddress, 100))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");

      // Tokens stay in UP
      expect(await mockLSP7.balanceOf(upAddress)).to.equal(100);
    });

    it("should reject tokens where creator hasn't verified issuance (no LSP12)", async function () {
      const upAddress = await universalProfile.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();
      const forwardeeAddress = await forwardee.getAddress();

      // Set up LSP4Creators[] on asset
      await setLSP4Creators(mockLSP7, [creator1Address], lsp7Holder);

      // DO NOT set up LSP12IssuedAssets[] - creator hasn't verified

      // Add creator to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Configure UAP
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [forwardeeAddress]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Should reject: creator in list but hasn't verified issuance
      await expect(mockLSP7.connect(lsp7Holder).mint(upAddress, 100))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");

      expect(await mockLSP7.balanceOf(upAddress)).to.equal(100);
    });
  });

  describe("Integration Tests", function () {
    it("full flow: non-ERC725Y token received, tokens stay in UP", async function () {
      const upAddress = await universalProfile.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();
      const forwardeeAddress = await forwardee.getAddress();

      // Configure UAP
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [forwardeeAddress]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Receive non-ERC725Y token
      await mockLSP7WithoutERC725Y.connect(lsp7Holder).mint(upAddress, 500);

      // Verify: no revert, no forwarding, tokens stay in UP
      expect(await mockLSP7WithoutERC725Y.balanceOf(upAddress)).to.equal(500);
      expect(await mockLSP7WithoutERC725Y.balanceOf(forwardeeAddress)).to.equal(0);
    });

    it("full flow: proper LSP7 with verified creator, forwarding occurs", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();
      const forwardeeAddress = await forwardee.getAddress();

      // Set up LSP4+LSP12 properly
      await setLSP4Creators(mockLSP7, [creator1Address], lsp7Holder);
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Configure UAP
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [forwardeeAddress]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Mint and verify forwarding
      await mockLSP7.connect(lsp7Holder).mint(upAddress, 1000);

      expect(await mockLSP7.balanceOf(forwardeeAddress)).to.equal(1000);
    });

    it("mixed scenario: both token types work correctly in sequence", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();
      const forwardeeAddress = await forwardee.getAddress();

      // Configure UAP once
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [forwardeeAddress]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // First: receive non-ERC725Y token (no revert, no forward)
      await mockLSP7WithoutERC725Y.connect(lsp7Holder).mint(upAddress, 100);
      expect(await mockLSP7WithoutERC725Y.balanceOf(upAddress)).to.equal(100);

      // Second: set up proper LSP7 with creator
      await setLSP4Creators(mockLSP7, [creator1Address], lsp7Holder);
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Third: receive proper LSP7 (should forward)
      await mockLSP7.connect(lsp7Holder).mint(upAddress, 200);
      expect(await mockLSP7.balanceOf(forwardeeAddress)).to.equal(200);

      // Both scenarios worked correctly
      expect(await mockLSP7WithoutERC725Y.balanceOf(upAddress)).to.equal(100); // stayed
      expect(await mockLSP7.balanceOf(forwardeeAddress)).to.equal(200); // forwarded
    });
  });

  describe("Regression Tests", function () {
    it("should not break existing creator verification logic", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();
      const forwardeeAddress = await forwardee.getAddress();

      // Use existing test pattern
      await setLSP4Creators(mockLSP7, [creator1Address], lsp7Holder);
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Configure UAP
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [forwardeeAddress]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Verify LSP4<->LSP12 two-way verification still works
      await expect(mockLSP7.connect(lsp7Holder).mint(upAddress, 100))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked");

      expect(await mockLSP7.balanceOf(forwardeeAddress)).to.equal(100);
    });
  });
});
