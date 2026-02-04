import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { LSP1_TYPE_IDS, INTERFACE_IDS } from "@lukso/lsp-smart-contracts";
import {
  NotifierCreatorListScreener,
  UniversalProfile,
} from "../../typechain-types";
import {
  deployUniversalProfile,
  deployMockAssets,
  mergeListEntry,
  setListNameOnScreener,
  setLSP4Creators,
  setLSP12IssuedAssets,
  setScreenerConfig,
} from "../utils/TestUtils";
import ERC725, { ERC725JSONSchema } from "@erc725/erc725.js";
import UAPSchema from '../../schemas/UAP.json';
import GRAVEAllowlistSchema from '../../schemas/GRAVEAllowlist.json';

describe("NotifierCreatorListScreener - Unit Tests (Direct Screener Calls)", function () {
  const allowlistName = "CreatorAllowlist";
  const LSP7_TYPEID = LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification;

  let owner: Signer;
  let browserController: Signer;
  let lsp7Holder: Signer;
  let creator1: Signer;
  let creator1Controller: Signer;
  let creator2: Signer;
  let creator2Controller: Signer;
  let creator3: Signer;
  let creator3Controller: Signer;
  let universalProfile: UniversalProfile;
  let creatorListScreener: NotifierCreatorListScreener;
  let mockLSP7: any;
  let creatorProfile1: UniversalProfile;
  let creatorProfile2: UniversalProfile;
  let creatorProfile3: UniversalProfile;
  let erc725UAP: ERC725;

  beforeEach(async function () {
    [
      owner,
      browserController,
      lsp7Holder,
      creator1,
      creator1Controller,
      creator2,
      creator2Controller,
      creator3,
      creator3Controller,
    ] = await ethers.getSigners();

    // Deploy main UP
    ({ universalProfile } = await deployUniversalProfile(owner, browserController));

    // Deploy creator profiles
    ({ universalProfile: creatorProfile1 } = await deployUniversalProfile(creator1, creator1Controller));
    ({ universalProfile: creatorProfile2 } = await deployUniversalProfile(creator2, creator2Controller));
    ({ universalProfile: creatorProfile3 } = await deployUniversalProfile(creator3, creator3Controller));

    // Deploy real LSP7 with ERC725Y support
    ({ lsp7: mockLSP7 } = await deployMockAssets(lsp7Holder));

    erc725UAP = new ERC725([
      ...UAPSchema,
      ...GRAVEAllowlistSchema
    ] as ERC725JSONSchema[], universalProfile.target, ethers.provider);

    // Deploy screener
    const NotifierCreatorListScreenerFactory = await ethers.getContractFactory("NotifierCreatorListScreener");
    creatorListScreener = await NotifierCreatorListScreenerFactory.deploy();
  });

  describe("Direct evaluate() calls - Validate creator fetching", function () {
    it("should return FALSE when token has no LSP4Creators[] array", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Setup configuration
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(
        erc725UAP,
        universalProfile,
        screenerAddress, // using screener as executive for simplicity
        0,
        [screenerAddress],
        LSP7_TYPEID,
        [encodedConfig]
      );

      // Token has NO LSP4Creators set

      // Call evaluate() directly
      const result = await creatorListScreener.evaluate(
        upAddress,
        screenerAddress,
        0, // screenerOrder
        lsp7Address, // notifier (the token)
        0, // value
        LSP7_TYPEID,
        "0x" // lsp1Data
      );

      // Should return false - no creators means no verified creators
      // With returnValueWhenInList=true, no creators returns !true = false
      expect(result).to.be.false;
    });

    it("should return FALSE when token has creators but NONE are verified (no LSP12)", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set LSP4Creators on token
      await setLSP4Creators(mockLSP7, [creator1Address], lsp7Holder);

      // DO NOT set LSP12IssuedAssets - creator hasn't verified

      // Add creator to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Setup configuration
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(
        erc725UAP,
        universalProfile,
        screenerAddress,
        0,
        [screenerAddress],
        LSP7_TYPEID,
        [encodedConfig]
      );

      // Call evaluate() directly
      const result = await creatorListScreener.evaluate(
        upAddress,
        screenerAddress,
        0,
        lsp7Address,
        0,
        LSP7_TYPEID,
        "0x"
      );

      // Should return false - creator not verified even though in list
      expect(result).to.be.false;
    });

    it("should return TRUE when single creator is verified AND in list", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set LSP4Creators on token
      await setLSP4Creators(mockLSP7, [creator1Address], lsp7Holder);

      // Set LSP12IssuedAssets on creator profile (verify issuance)
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);

      // Add creator to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Setup configuration
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(
        erc725UAP,
        universalProfile,
        screenerAddress,
        0,
        [screenerAddress],
        LSP7_TYPEID,
        [encodedConfig]
      );

      // Call evaluate() directly
      const result = await creatorListScreener.evaluate(
        upAddress,
        screenerAddress,
        0,
        lsp7Address,
        0,
        LSP7_TYPEID,
        "0x"
      );

      // Should return TRUE - creator verified AND in list
      expect(result).to.be.true;
    });

    it("should return FALSE when creator verified but NOT in list", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set LSP4Creators on token
      await setLSP4Creators(mockLSP7, [creator1Address], lsp7Holder);

      // Set LSP12IssuedAssets (verified)
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);

      // DO NOT add creator to allowlist

      // Setup configuration
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(
        erc725UAP,
        universalProfile,
        screenerAddress,
        0,
        [screenerAddress],
        LSP7_TYPEID,
        [encodedConfig]
      );

      // Call evaluate() directly
      const result = await creatorListScreener.evaluate(
        upAddress,
        screenerAddress,
        0,
        lsp7Address,
        0,
        LSP7_TYPEID,
        "0x"
      );

      // Should return FALSE - creator verified but not in list
      expect(result).to.be.false;
    });

    it("should correctly handle multiple creators with requireAllCreators=true", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const creator2Address = await creatorProfile2.getAddress();
      const creator3Address = await creatorProfile3.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set LSP4Creators with 3 creators
      await setLSP4Creators(mockLSP7, [creator1Address, creator2Address, creator3Address], lsp7Holder);

      // Only creator1 and creator3 verify issuance (creator2 does NOT)
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      // Skip creator2
      await setLSP12IssuedAssets(creatorProfile3, [lsp7Address], creator3);

      // Add creator1 to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Setup configuration with requireAllCreators=true
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]); // requireAllCreators=true
      await setScreenerConfig(
        erc725UAP,
        universalProfile,
        screenerAddress,
        0,
        [screenerAddress],
        LSP7_TYPEID,
        [encodedConfig]
      );

      // Call evaluate() directly
      const result = await creatorListScreener.evaluate(
        upAddress,
        screenerAddress,
        0,
        lsp7Address,
        0,
        LSP7_TYPEID,
        "0x"
      );

      // Should return FALSE - requireAllCreators=true but creator2 not verified
      // getVerifiedCreators with requireAllCreators=true should return empty array
      expect(result).to.be.false;
    });

    it("should correctly handle multiple creators with requireAllCreators=false", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const creator2Address = await creatorProfile2.getAddress();
      const creator3Address = await creatorProfile3.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set LSP4Creators with 3 creators
      await setLSP4Creators(mockLSP7, [creator1Address, creator2Address, creator3Address], lsp7Holder);

      // Only creator1 and creator3 verify issuance (creator2 does NOT)
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      // Skip creator2
      await setLSP12IssuedAssets(creatorProfile3, [lsp7Address], creator3);

      // Add creator1 to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Setup configuration with requireAllCreators=false
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [false, true]); // requireAllCreators=false
      await setScreenerConfig(
        erc725UAP,
        universalProfile,
        screenerAddress,
        0,
        [screenerAddress],
        LSP7_TYPEID,
        [encodedConfig]
      );

      // Call evaluate() directly
      const result = await creatorListScreener.evaluate(
        upAddress,
        screenerAddress,
        0,
        lsp7Address,
        0,
        LSP7_TYPEID,
        "0x"
      );

      // Should return TRUE - requireAllCreators=false, creator1 verified AND in list
      // getVerifiedCreators returns [creator1, creator3], creator1 is in list
      expect(result).to.be.true;
    });

    it("should handle ALL creators verified, one in list (requireAllCreators=true)", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const creator2Address = await creatorProfile2.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set LSP4Creators with 2 creators
      await setLSP4Creators(mockLSP7, [creator1Address, creator2Address], lsp7Holder);

      // BOTH verify issuance
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      await setLSP12IssuedAssets(creatorProfile2, [lsp7Address], creator2);

      // Add only creator1 to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Setup configuration with requireAllCreators=true
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(
        erc725UAP,
        universalProfile,
        screenerAddress,
        0,
        [screenerAddress],
        LSP7_TYPEID,
        [encodedConfig]
      );

      // Call evaluate() directly
      const result = await creatorListScreener.evaluate(
        upAddress,
        screenerAddress,
        0,
        lsp7Address,
        0,
        LSP7_TYPEID,
        "0x"
      );

      // Should return TRUE - all verified, at least one (creator1) in list
      expect(result).to.be.true;
    });

    it("should return inverse when returnValueWhenInList=false (blocklist mode)", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set LSP4Creators and verify
      await setLSP4Creators(mockLSP7, [creator1Address], lsp7Holder);
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);

      // Add creator to list (blocklist in this case)
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Setup configuration with returnValueWhenInList=false (blocklist behavior)
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, false]); // returnValueWhenInList=false
      await setScreenerConfig(
        erc725UAP,
        universalProfile,
        screenerAddress,
        0,
        [screenerAddress],
        LSP7_TYPEID,
        [encodedConfig]
      );

      // Call evaluate() directly
      const result = await creatorListScreener.evaluate(
        upAddress,
        screenerAddress,
        0,
        lsp7Address,
        0,
        LSP7_TYPEID,
        "0x"
      );

      // Should return FALSE - creator in list but returnValueWhenInList=false
      expect(result).to.be.false;
    });
  });

  describe("Validate assumptions about creator array indexing", function () {
    it("should correctly fetch all 3 creators from LSP4Creators[] array", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const creator2Address = await creatorProfile2.getAddress();
      const creator3Address = await creatorProfile3.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set LSP4Creators with 3 creators
      await setLSP4Creators(mockLSP7, [creator1Address, creator2Address, creator3Address], lsp7Holder);

      // Verify all 3 issuances
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      await setLSP12IssuedAssets(creatorProfile2, [lsp7Address], creator2);
      await setLSP12IssuedAssets(creatorProfile3, [lsp7Address], creator3);

      // Add all 3 to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator2Address, INTERFACE_IDS.LSP0ERC725Account);
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator3Address, INTERFACE_IDS.LSP0ERC725Account);

      // Setup configuration
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(
        erc725UAP,
        universalProfile,
        screenerAddress,
        0,
        [screenerAddress],
        LSP7_TYPEID,
        [encodedConfig]
      );

      // Call evaluate() - if ALL 3 creators are fetched and verified, this should pass
      const result = await creatorListScreener.evaluate(
        upAddress,
        screenerAddress,
        0,
        lsp7Address,
        0,
        LSP7_TYPEID,
        "0x"
      );

      // Should return TRUE - all 3 creators fetched, verified, and in list
      expect(result).to.be.true;
    });

    it("should detect when middle creator (index 1) is NOT verified", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const creator2Address = await creatorProfile2.getAddress();
      const creator3Address = await creatorProfile3.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set LSP4Creators with 3 creators
      await setLSP4Creators(mockLSP7, [creator1Address, creator2Address, creator3Address], lsp7Holder);

      // Verify only creator1 and creator3 (skip creator2 at index 1)
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      // Skip creator2 - NOT verified
      await setLSP12IssuedAssets(creatorProfile3, [lsp7Address], creator3);

      // Add all to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator2Address, INTERFACE_IDS.LSP0ERC725Account);
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator3Address, INTERFACE_IDS.LSP0ERC725Account);

      // Setup with requireAllCreators=true
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]); // requireAllCreators=true
      await setScreenerConfig(
        erc725UAP,
        universalProfile,
        screenerAddress,
        0,
        [screenerAddress],
        LSP7_TYPEID,
        [encodedConfig]
      );

      // Call evaluate()
      const result = await creatorListScreener.evaluate(
        upAddress,
        screenerAddress,
        0,
        lsp7Address,
        0,
        LSP7_TYPEID,
        "0x"
      );

      // Should return FALSE - requireAllCreators=true but creator2 not verified
      // This validates that the screener correctly iterates through ALL indices
      expect(result).to.be.false;
    });
  });
});
