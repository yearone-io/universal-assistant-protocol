import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { LSP1_TYPE_IDS, INTERFACE_IDS } from "@lukso/lsp-smart-contracts";
import {
  UniversalReceiverDelegateUAP,
  NotifierCreatorListScreener,
  ForwarderAssistant,
  UniversalProfile,
} from "../../typechain-types";
import {
  deployUniversalProfile,
  deployMockAssets,
  setScreenerConfig,
  setExecutiveConfig,
  mergeListEntry,
  setListNameOnScreener,
  generateListItemIndexKey,
  toSolidityBytes32Prefixed,
} from "../utils/TestUtils";
import ERC725, { ERC725JSONSchema } from "@erc725/erc725.js";
import UAPSchema from '../../schemas/UAP.json';
import GRAVEAllowlistSchema from '../../schemas/GRAVEAllowlist.json';

describe("NotifierCreatorListScreener", function () {
  const allowlistName = "CreatorAllowlist";
  const LSP7_TYPEID = LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification;

  // LSP4 and LSP12 constants
  const LSP4_CREATORS_ARRAY_KEY = "0x114bd03b3a46d48759680d81ebb2b414fda7d030a7105a851867accf1c2352e7";
  const LSP4_CREATORS_MAP_PREFIX = "0x6de85eaf5d982b4e5da0";
  const LSP12_ISSUED_ASSETS_ARRAY_KEY = "0x7c8c3416d6cda87cd42c71ea1843df28ac4850354f988d55ee2eaa47b6dc05cd";
  const LSP12_ISSUED_ASSETS_MAP_PREFIX = "0x74ac2555c10b9349e78f";

  let owner: Signer;
  let browserController: Signer;
  let lsp7Holder: Signer;
  let creator1: Signer;
  let creator1Controller: Signer;
  let creator2: Signer;
  let creator2Controller: Signer;
  let nonOwner: Signer;
  let universalProfile: UniversalProfile;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let creatorListScreener: NotifierCreatorListScreener;
  let forwarderAssistant: ForwarderAssistant;
  let mockLSP7A: any;
  let creatorProfile1: UniversalProfile;
  let creatorProfile2: UniversalProfile;
  let erc725UAP: ERC725;

  /**
   * Helper: Set LSP4Creators[] on an asset
   */
  async function setLSP4Creators(asset: any, creators: string[], assetOwner: Signer) {
    const keys: string[] = [];
    const values: string[] = [];

    // Set array length
    keys.push(LSP4_CREATORS_ARRAY_KEY);
    values.push(toSolidityBytes32Prefixed(creators.length));

    // Set each creator in the array
    for (let i = 0; i < creators.length; i++) {
      // Generate array element key
      const arrayElementKey = LSP4_CREATORS_ARRAY_KEY.slice(0, 34) +
        BigInt(i).toString(16).padStart(32, "0");
      keys.push(arrayElementKey);
      values.push(ethers.zeroPadValue(creators[i], 32));

      // Set mapping entry: LSP4CreatorsMap:<address>
      const mapKey = LSP4_CREATORS_MAP_PREFIX + "0000" + creators[i].slice(2);
      const mapValue = INTERFACE_IDS.LSP0ERC725Account +
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [i]).slice(2);
      keys.push(mapKey);
      values.push(mapValue);
    }

    await asset.connect(assetOwner).setDataBatch(keys, values);
  }

  /**
   * Helper: Set LSP12IssuedAssets[] on a creator profile
   */
  async function setLSP12IssuedAssets(creatorProfile: UniversalProfile, assets: string[], profileOwner: Signer) {
    const keys: string[] = [];
    const values: string[] = [];

    // Set array length using LSP12 key
    keys.push(LSP12_ISSUED_ASSETS_ARRAY_KEY);
    values.push(toSolidityBytes32Prefixed(assets.length));

    // Set each asset in the array
    for (let i = 0; i < assets.length; i++) {
      // Generate array element key: first 16 bytes of array key + index
      const arrayElementKey = LSP12_ISSUED_ASSETS_ARRAY_KEY.slice(0, 34) +
        BigInt(i).toString(16).padStart(32, "0");
      keys.push(arrayElementKey);
      values.push(ethers.zeroPadValue(assets[i], 32));

      // Set mapping entry: LSP12IssuedAssetsMap:<address>
      const mapKey = LSP12_ISSUED_ASSETS_MAP_PREFIX + "0000" + assets[i].slice(2);
      const mapValue = INTERFACE_IDS.LSP7DigitalAsset +
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [i]).slice(2);
      keys.push(mapKey);
      values.push(mapValue);
    }

    await creatorProfile.connect(profileOwner).setDataBatch(keys, values);
  }

  beforeEach(async function () {
    [owner, browserController, lsp7Holder, creator1, creator1Controller, creator2, creator2Controller, nonOwner] = await ethers.getSigners();

    // Deploy main UP
    ({ universalProfile, universalReceiverDelegateUAP } = await deployUniversalProfile(owner, browserController));

    // Deploy creator profiles
    ({ universalProfile: creatorProfile1 } = await deployUniversalProfile(creator1, creator1Controller));
    ({ universalProfile: creatorProfile2 } = await deployUniversalProfile(creator2, creator2Controller));

    // Deploy mock asset
    ({ lsp7: mockLSP7A } = await deployMockAssets(lsp7Holder));

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

  describe("Creator Verification Logic", function () {
    it("should reject when asset has no creators (empty LSP4Creators[])", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Configure UAP
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      // Config: requireAllCreators=true, returnValueWhenInList=true
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Asset has NO creators - should be rejected
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 100))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
    });

    it("should pass when single creator verified and in list", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set up LSP4Creators[] on asset
      await setLSP4Creators(mockLSP7A, [creator1Address], lsp7Holder);

      // Set up LSP12IssuedAssets[] on creator profile
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);

      // Add creator to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Configure UAP
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      // Config: requireAllCreators=true, returnValueWhenInList=true
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Should pass: creator verified and in list
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 100))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddress, forwarderAddress);

      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(100);
    });

    it("should reject when creator verified but NOT in list", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set up LSP4Creators[] on asset
      await setLSP4Creators(mockLSP7A, [creator1Address], lsp7Holder);

      // Set up LSP12IssuedAssets[] on creator profile
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);

      // DO NOT add creator to allowlist

      // Configure UAP
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Should reject: creator verified but not in list
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 100))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
    });

    it("should reject when creator in list but NOT verified issuance", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set up LSP4Creators[] on asset
      await setLSP4Creators(mockLSP7A, [creator1Address], lsp7Holder);

      // DO NOT set up LSP12IssuedAssets[] - creator hasn't verified

      // Add creator to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Configure UAP
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Should reject: creator in list but hasn't verified issuance
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 100))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
    });
  });

  describe("Multiple Creators - requireAllCreators Logic", function () {
    it("should pass when requireAllCreators=true, all creators verified, and at least one in list", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const creator2Address = await creatorProfile2.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set up LSP4Creators[] with two creators
      await setLSP4Creators(mockLSP7A, [creator1Address, creator2Address], lsp7Holder);

      // Both creators verify issuance
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      await setLSP12IssuedAssets(creatorProfile2, [lsp7Address], creator2);

      // Only add creator1 to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Configure UAP
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      // Config: requireAllCreators=true, returnValueWhenInList=true
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Should pass: all verified, one in list
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 100))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddress, forwarderAddress);
    });

    it("should reject when requireAllCreators=true but only one creator verified", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const creator2Address = await creatorProfile2.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set up LSP4Creators[] with two creators
      await setLSP4Creators(mockLSP7A, [creator1Address, creator2Address], lsp7Holder);

      // Only creator1 verifies issuance
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      // creator2 does NOT verify

      // Add creator1 to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Configure UAP
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      // Config: requireAllCreators=true, returnValueWhenInList=true
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Should reject: requireAllCreators=true but creator2 didn't verify
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 100))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
    });

    it("should pass when requireAllCreators=false and at least one creator verified and in list", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const creator2Address = await creatorProfile2.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      // Set up LSP4Creators[] with two creators
      await setLSP4Creators(mockLSP7A, [creator1Address, creator2Address], lsp7Holder);

      // Only creator1 verifies issuance
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      // creator2 does NOT verify

      // Add creator1 to allowlist
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      // Configure UAP
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      // Config: requireAllCreators=FALSE, returnValueWhenInList=true
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [false, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Should pass: requireAllCreators=false, one verified and in list
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 100))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddress, forwarderAddress);
    });
  });

  describe("returnValueWhenInList Configuration", function () {
    it("should reject when in list but returnValueWhenInList=false", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const creator1Address = await creatorProfile1.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await creatorListScreener.getAddress();

      await setLSP4Creators(mockLSP7A, [creator1Address], lsp7Holder);
      await setLSP12IssuedAssets(creatorProfile1, [lsp7Address], creator1);
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, creator1Address, INTERFACE_IDS.LSP0ERC725Account);

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);

      // Config: requireAllCreators=true, returnValueWhenInList=FALSE
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, false]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Should reject: creator verified and in list, but returnValueWhenInList=false (blocklist behavior)
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 100))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
    });
  });
});
