import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { LSP1_TYPE_IDS, INTERFACE_IDS } from "@lukso/lsp-smart-contracts";
import {
  UniversalReceiverDelegateUAP,
  NotifierListScreener,
  NotifierCurationScreener,
  ForwarderAssistant,
} from "../../typechain-types";
import {
  deployUniversalProfile,
  deployMockAssets,
  setScreenerConfig,
  setExecutiveConfig,
  addressToBytes32,
  mergeListEntry,
  generateListItemIndexKey,
  setListNameOnScreener,
  removeListEntry,
} from "../utils/TestUtils";
import ERC725, { ERC725JSONSchema } from "@erc725/erc725.js";
import UAPSchema from '../../schemas/UAP.json';
import GRAVEAllowlistSchema from '../../schemas/GRAVEAllowlist.json';

describe("Screeners: Address and Curation Checkers", function () {
  const allowlistName = "GRAVEAllowlist";
  const blocklistName = "GRAVEBlocklist";
  let owner: Signer;
  let browserController: Signer;
  let lsp7Holder: Signer;
  let nonOwner: Signer;
  let universalProfile: any;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let addressListChecker: NotifierListScreener;
  let curationChecker: NotifierCurationScreener;
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
    erc725UAP = new ERC725([
      ...UAPSchema,
      ...GRAVEAllowlistSchema
    ] as ERC725JSONSchema[], universalProfile.target, ethers.provider);

    const NotifierListScreenerFactory = await ethers.getContractFactory("NotifierListScreener");
    addressListChecker = await NotifierListScreenerFactory.deploy();
    const NotifierCurationScreenerFactory = await ethers.getContractFactory("NotifierCurationScreener");
    curationChecker = await NotifierCurationScreenerFactory.deploy();
    const ForwarderFactory = await ethers.getContractFactory("ForwarderAssistant");
    forwarderAssistant = await ForwarderFactory.deploy();
  });

  describe("NotifierListScreener", function () {
    it("should engage executive when notifier is in allowlist and returnValueWhenAllowed is true", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await addressListChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));
      // set list name associated with screener
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);
      // set whether screener returns true or false when value is in list associated with it
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      // add entry to allow list
      await mergeListEntry(
        erc725UAP,
        universalProfile,
        allowlistName,
        lsp7Address,
        INTERFACE_IDS.LSP7DigitalAsset
      )
      // sanity check that list values are being set correctly
      const entryMapKey = erc725UAP.encodeKeyName(`${allowlistName}Map:<address>`, [lsp7Address]);
      const itemIndexKey = generateListItemIndexKey(erc725UAP, allowlistName, 0);
      const listLengthKey = erc725UAP.encodeKeyName(`${allowlistName}[]`);
      let [entryRaw, listLengthRaw, itemAddressRaw] = await universalProfile.getDataBatch([
        entryMapKey,
        listLengthKey,
        itemIndexKey
      ]);
      let itemType = erc725UAP.decodeValueType("bytes4", entryRaw.slice(0,10));
      let itemPosition = Number(erc725UAP.decodeValueType("uint256", "0x" + entryRaw.slice(10)));
      let listLength = Number(erc725UAP.decodeValueType("uint256", listLengthRaw));
      let itemAddress = erc725UAP.decodeValueType("address", itemAddressRaw);
      expect(listLength).to.equal(1);
      expect(itemAddress).to.equal(lsp7Address);
      expect(itemType).to.equal(INTERFACE_IDS.LSP7DigitalAsset);
      expect(itemPosition).to.equal(0);
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
      // sanity check removal of item from allow list
      
      await removeListEntry(
        erc725UAP,
        universalProfile,
        allowlistName,
        lsp7Address
      );
      [entryRaw, listLengthRaw, itemAddressRaw] = await universalProfile.getDataBatch([
        entryMapKey,
        listLengthKey,
        itemIndexKey
      ]);
      itemType = entryRaw && entryRaw !== "0x" ? erc725UAP.decodeValueType("bytes4", entryRaw.slice(0,10)) : null;
      itemPosition = entryRaw && entryRaw !== "0x" ? Number(erc725UAP.decodeValueType("uint256", "0x" + entryRaw.slice(10))) : null;
      listLength = listLengthRaw && listLengthRaw !== "0x" ? Number(erc725UAP.decodeValueType("uint256", listLengthRaw)) : 0;
      itemAddress = itemAddressRaw && itemAddressRaw !== "0x" ? erc725UAP.decodeValueType("address", itemAddressRaw) : null;
      expect(listLength).to.equal(0);
      expect(itemAddress).to.equal(null);
      expect(entryRaw).to.equal("0x");
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
      // set list name associated with screener
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);
      // set whether screener returns true or false when value is in list associated with it
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [false]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      // add entry to allow list
      await mergeListEntry(
        erc725UAP,
        universalProfile,
        allowlistName,
        lsp7Address,
        INTERFACE_IDS.LSP7DigitalAsset
      )
      // sanity check that list values are being set correctly
      const entryMapKey = erc725UAP.encodeKeyName(`${allowlistName}Map:<address>`, [lsp7Address]);
      const itemIndexKey = generateListItemIndexKey(erc725UAP, allowlistName, 0);
      const listLengthKey = erc725UAP.encodeKeyName(`${allowlistName}[]`);
      let [entryRaw, listLengthRaw, itemAddressRaw] = await universalProfile.getDataBatch([
        entryMapKey,
        listLengthKey,
        itemIndexKey
      ]);
      let itemType = erc725UAP.decodeValueType("bytes4", entryRaw.slice(0,10));
      let itemPosition = Number(erc725UAP.decodeValueType("uint256", "0x" + entryRaw.slice(10)));
      let listLength = Number(erc725UAP.decodeValueType("uint256", listLengthRaw));
      let itemAddress = erc725UAP.decodeValueType("address", itemAddressRaw);
      expect(listLength).to.equal(1);
      expect(itemAddress).to.equal(lsp7Address);
      expect(itemType).to.equal(INTERFACE_IDS.LSP7DigitalAsset);
      expect(itemPosition).to.equal(0);
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
      const lsp7Address = await mockLSP7B.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await addressListChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));
      // set list name associated with screener
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);
      // set whether screener returns true or false when value is in list associated with it
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      // add entry to allow list
      await mergeListEntry(
        erc725UAP,
        universalProfile,
        allowlistName,
        lsp7Address,
        INTERFACE_IDS.LSP7DigitalAsset
      )
      // sanity check that list values are being set correctly
      const entryMapKey = erc725UAP.encodeKeyName(`${allowlistName}Map:<address>`, [lsp7Address]);
      const itemIndexKey = generateListItemIndexKey(erc725UAP, allowlistName, 0);
      const listLengthKey = erc725UAP.encodeKeyName(`${allowlistName}[]`);
      let [entryRaw, listLengthRaw, itemAddressRaw] = await universalProfile.getDataBatch([
        entryMapKey,
        listLengthKey,
        itemIndexKey
      ]);
      let itemType = erc725UAP.decodeValueType("bytes4", entryRaw.slice(0,10));
      let itemPosition = Number(erc725UAP.decodeValueType("uint256", "0x" + entryRaw.slice(10)));
      let listLength = Number(erc725UAP.decodeValueType("uint256", listLengthRaw));
      let itemAddress = erc725UAP.decodeValueType("address", itemAddressRaw);
      expect(listLength).to.equal(1);
      expect(itemAddress).to.equal(lsp7Address);
      expect(itemType).to.equal(INTERFACE_IDS.LSP7DigitalAsset);
      expect(itemPosition).to.equal(0);
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

    it("should reject stale entries from previous list iterations (vulnerability test)", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7AddressA = await mockLSP7A.getAddress();
      const lsp7AddressB = await mockLSP7B.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await addressListChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      // Set up screener with allowlist
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      // Phase 1: Create list with 2 entries
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, lsp7AddressA, INTERFACE_IDS.LSP7DigitalAsset);
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, lsp7AddressB, INTERFACE_IDS.LSP7DigitalAsset);

      // Verify both are in the list
      const listLengthKey = erc725UAP.encodeKeyName(`${allowlistName}[]`);
      let listLengthRaw = await universalProfile.getData(listLengthKey);
      let listLength = Number(erc725UAP.decodeValueType("uint256", listLengthRaw));
      expect(listLength).to.equal(2);

      // Set executive config
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Verify lsp7A is allowed
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 10))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddress, forwarderAddress);

      // Phase 2: Remove all entries
      await removeListEntry(erc725UAP, universalProfile, allowlistName, lsp7AddressA);
      await removeListEntry(erc725UAP, universalProfile, allowlistName, lsp7AddressB);

      // Verify list is empty
      listLengthRaw = await universalProfile.getData(listLengthKey);
      listLength = listLengthRaw && listLengthRaw !== "0x" ? Number(erc725UAP.decodeValueType("uint256", listLengthRaw)) : 0;
      expect(listLength).to.equal(0);

      // Phase 3: Recreate list with same name but only 1 entry (different address)
      const [newSigner] = await ethers.getSigners();
      const newAddress = await newSigner.getAddress();
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, newAddress, INTERFACE_IDS.LSP7DigitalAsset);

      // Verify new list has length 1
      listLengthRaw = await universalProfile.getData(listLengthKey);
      listLength = Number(erc725UAP.decodeValueType("uint256", listLengthRaw));
      expect(listLength).to.equal(1);

      // CRITICAL TEST: Old addresses from previous iteration should be REJECTED
      // Even though their mapping entries might still exist, they should fail the bounds check
      const lsp7AMapKey = erc725UAP.encodeKeyName(`${allowlistName}Map:<address>`, [lsp7AddressA]);
      const lsp7AMapValue = await universalProfile.getData(lsp7AMapKey);

      // The map entry should be cleared (0x) from removeListEntry
      expect(lsp7AMapValue).to.equal("0x");

      // Verify lsp7A is now rejected (tokens stay in UP, not forwarded)
      const upBalanceBefore = await mockLSP7A.balanceOf(upAddress);
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 20))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(upBalanceBefore + BigInt(20));
      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(10); // Only the first 10 from phase 1
    });

    it("should reject manually-set stale mapping entry beyond list length", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7AddressA = await mockLSP7A.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await addressListChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      // Set up screener with allowlist
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      // Create a list with 1 entry (index 0)
      const [newSigner] = await ethers.getSigners();
      const validAddress = await newSigner.getAddress();
      await mergeListEntry(erc725UAP, universalProfile, allowlistName, validAddress, INTERFACE_IDS.LSP7DigitalAsset);

      // Manually set a mapping entry for lsp7A pointing to index 5 (beyond list length of 1)
      const lsp7AMapKey = erc725UAP.encodeKeyName(`${allowlistName}Map:<address>`, [lsp7AddressA]);
      // Encode: bytes4 interfaceId + uint256 index (5)
      const maliciousMapValue = ethers.solidityPacked(
        ["bytes4", "uint256"],
        [INTERFACE_IDS.LSP7DigitalAsset, 5]
      );
      await universalProfile.setData(lsp7AMapKey, maliciousMapValue);

      // Verify the malicious entry was set
      const mapValue = await universalProfile.getData(lsp7AMapKey);
      expect(mapValue).to.equal(maliciousMapValue);

      // Set executive config
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // CRITICAL TEST: lsp7A should be REJECTED because index 5 >= list length (1)
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 100))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(100);
      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(0);
    });
  });

  describe("NotifierCurationScreener", function () {
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

      // set screener config
      const curatedEntryId = addressToBytes32(lsp7Address);
      await mockLSP8.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);
      // set screener blocklist
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, blocklistName);
      await mergeListEntry(
        erc725UAP,
        universalProfile,
        blocklistName,
        lsp7Address,
        INTERFACE_IDS.LSP7DigitalAsset
      );
      await mergeListEntry(
        erc725UAP,
        universalProfile,
        blocklistName,
        lsp7BAddress,
        INTERFACE_IDS.LSP7DigitalAsset
      );
      // sanity check that list values are being set correctly
      const entryMapKey = erc725UAP.encodeKeyName(`${blocklistName}Map:<address>`, [lsp7BAddress]);
      const itemIndexKey = generateListItemIndexKey(erc725UAP, blocklistName, 1);
      const listLengthKey = erc725UAP.encodeKeyName(`${blocklistName}[]`);
      let [entryRaw, listLengthRaw, itemAddressRaw] = await universalProfile.getDataBatch([
        entryMapKey,
        listLengthKey,
        itemIndexKey
      ]);
      let itemType = erc725UAP.decodeValueType("bytes4", entryRaw.slice(0,10));
      let itemPosition = Number(erc725UAP.decodeValueType("uint256", "0x" + entryRaw.slice(10)));
      let listLength = Number(erc725UAP.decodeValueType("uint256", listLengthRaw));
      let itemAddress = erc725UAP.decodeValueType("address", itemAddressRaw);
      expect(listLength).to.equal(2);
      expect(itemAddress).to.equal(lsp7BAddress);
      expect(itemType).to.equal(INTERFACE_IDS.LSP7DigitalAsset);
      expect(itemPosition).to.equal(1);

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

    it("should reject stale blocklist entries from previous list iterations (vulnerability test)", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7AddressA = await mockLSP7A.getAddress();
      const lsp7AddressB = await mockLSP7B.getAddress();
      const curatedListAddress = await mockLSP8.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await curationChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      // Set up curation screener
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, blocklistName);
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      // Add both tokens to curated list so they would pass curation check
      const curatedEntryIdA = addressToBytes32(lsp7AddressA);
      const curatedEntryIdB = addressToBytes32(lsp7AddressB);
      await mockLSP8.connect(lsp7Holder).mint(lsp7AddressA, curatedEntryIdA);
      await mockLSP8.connect(lsp7Holder).mint(lsp7AddressB, curatedEntryIdB);

      // Phase 1: Create blocklist with 2 entries
      await mergeListEntry(erc725UAP, universalProfile, blocklistName, lsp7AddressA, INTERFACE_IDS.LSP7DigitalAsset);
      await mergeListEntry(erc725UAP, universalProfile, blocklistName, lsp7AddressB, INTERFACE_IDS.LSP7DigitalAsset);

      // Verify blocklist has 2 entries
      const listLengthKey = erc725UAP.encodeKeyName(`${blocklistName}[]`);
      let listLengthRaw = await universalProfile.getData(listLengthKey);
      let listLength = Number(erc725UAP.decodeValueType("uint256", listLengthRaw));
      expect(listLength).to.equal(2);

      // Set executive config
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // Verify lsp7A is blocked (curated but blocklisted)
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 10))
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(10);

      // Phase 2: Remove all blocklist entries
      await removeListEntry(erc725UAP, universalProfile, blocklistName, lsp7AddressA);
      await removeListEntry(erc725UAP, universalProfile, blocklistName, lsp7AddressB);

      // Verify blocklist is empty
      listLengthRaw = await universalProfile.getData(listLengthKey);
      listLength = listLengthRaw && listLengthRaw !== "0x" ? Number(erc725UAP.decodeValueType("uint256", listLengthRaw)) : 0;
      expect(listLength).to.equal(0);

      // Phase 3: Recreate blocklist with same name but only 1 entry (different address)
      const [newSigner] = await ethers.getSigners();
      const newAddress = await newSigner.getAddress();
      await mergeListEntry(erc725UAP, universalProfile, blocklistName, newAddress, INTERFACE_IDS.LSP7DigitalAsset);

      // Verify new blocklist has length 1
      listLengthRaw = await universalProfile.getData(listLengthKey);
      listLength = Number(erc725UAP.decodeValueType("uint256", listLengthRaw));
      expect(listLength).to.equal(1);

      // CRITICAL TEST: Old addresses from previous blocklist should NOT be blocked anymore
      // lsp7A is curated, not in current blocklist, so should be allowed
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 20))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddress, forwarderAddress);
      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(20);
    });

    it("should reject manually-set stale blocklist entry beyond list length", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7AddressA = await mockLSP7A.getAddress();
      const curatedListAddress = await mockLSP8.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const screenerAddress = await curationChecker.getAddress();

      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAddress]));

      // Set up curation screener
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, blocklistName);
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool"], [curatedListAddress, true]);
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAddress, 0, [screenerAddress], LSP7_TYPEID, [encodedConfig]);

      // Add lsp7A to curated list so it would pass curation check
      const curatedEntryIdA = addressToBytes32(lsp7AddressA);
      await mockLSP8.connect(lsp7Holder).mint(lsp7AddressA, curatedEntryIdA);

      // Create a blocklist with 1 entry (index 0)
      const [newSigner] = await ethers.getSigners();
      const validAddress = await newSigner.getAddress();
      await mergeListEntry(erc725UAP, universalProfile, blocklistName, validAddress, INTERFACE_IDS.LSP7DigitalAsset);

      // Manually set a blocklist mapping entry for lsp7A pointing to index 5 (beyond list length of 1)
      const lsp7AMapKey = erc725UAP.encodeKeyName(`${blocklistName}Map:<address>`, [lsp7AddressA]);
      const maliciousMapValue = ethers.solidityPacked(
        ["bytes4", "uint256"],
        [INTERFACE_IDS.LSP7DigitalAsset, 5]
      );
      await universalProfile.setData(lsp7AMapKey, maliciousMapValue);

      // Verify the malicious entry was set
      const mapValue = await universalProfile.getData(lsp7AMapKey);
      expect(mapValue).to.equal(maliciousMapValue);

      // Set executive config
      const encodedExecConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]);
      await setExecutiveConfig(erc725UAP, universalProfile, forwarderAddress, LSP7_TYPEID, 0, encodedExecConfig);

      // CRITICAL TEST: lsp7A should NOT be blocked because index 5 >= blocklist length (1)
      // It's curated and not in valid blocklist, so should be allowed
      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 100))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddress, forwarderAddress);
      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(100);
    });
  });

  describe("Chained Screeners: NotifierListScreener and NotifierCurationScreener", function () {
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

      // Configure Allowlist And Curation Screeners
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

      // set allow list name and add entry
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);
      await mergeListEntry(
        erc725UAP,
        universalProfile,
        allowlistName,
        lsp7Address,
        INTERFACE_IDS.LSP7DigitalAsset
      );

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
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);
      await mergeListEntry(
        erc725UAP,
        universalProfile,
        allowlistName,
        lsp7Address,
        INTERFACE_IDS.LSP7DigitalAsset
      );
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
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 0, allowlistName);
      await mergeListEntry(
        erc725UAP,
        universalProfile,
        allowlistName,
        lsp7Address,
        INTERFACE_IDS.LSP7DigitalAsset
      );
      const curatedEntryId = addressToBytes32(lsp7Address);
      await mockLSP8.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);
      // Add to blocklist
      await setListNameOnScreener(erc725UAP, universalProfile, LSP7_TYPEID, 1, blocklistName);
      await mergeListEntry(
        erc725UAP,
        universalProfile,
        blocklistName,
        lsp7Address,
        INTERFACE_IDS.LSP7DigitalAsset
      );
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