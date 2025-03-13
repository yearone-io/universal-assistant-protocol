import { ethers } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";
import { LSP1_TYPE_IDS } from "@lukso/lsp-smart-contracts";
import {
  UniversalReceiverDelegateUAP,
  AddressListChecker,
  CurationChecker,
  ForwarderAssistant,
} from "../../typechain-types";
import { customEncodeAddresses, deployUniversalProfile, deployMockAssets, setScreenerConfig, setExecutiveConfig, generateMappingKey, addressToBytes32 } from "../utils/TestUtils";

describe("Screeners: Address and Curation Checkers", function () {
  let owner: Signer;
  let browserController: Signer;
  let lsp7Holder: Signer;
  let nonOwner: Signer;
  let universalProfile: any;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let addressListChecker: AddressListChecker;
  let curationChecker: CurationChecker;
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

    const AddressListCheckerFactory = await ethers.getContractFactory("AddressListChecker");
    addressListChecker = await AddressListCheckerFactory.deploy();
    const CurationCheckerFactory = await ethers.getContractFactory("CurationChecker");
    curationChecker = await CurationCheckerFactory.deploy();
    const ForwarderFactory = await ethers.getContractFactory("ForwarderAssistant");
    forwarderAssistant = await ForwarderFactory.deploy();
  });

  describe("AddressListChecker", function () {
    it("should allow transaction when notifier is in address list", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([await forwarderAssistant.getAddress()]));

      const allowedAddresses = [lsp7Address];
      const encodedAddresses = customEncodeAddresses(allowedAddresses);
      await setScreenerConfig(universalProfile, forwarderAddress, [await addressListChecker.getAddress()], LSP7_TYPEID, [encodedAddresses]);
      await setExecutiveConfig(universalProfile, forwarderAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 69))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(await universalProfile.getAddress(), await forwarderAssistant.getAddress());
      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(69);
    });

    it("should not pass transactions to executive when notifier is not in address list", async function () {
      const upAddress = await universalProfile.getAddress();
      const forwarderAddress = await forwarderAssistant.getAddress();
      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAddress]));

      const allowedAddresses = [await nonOwner.getAddress()];
      const encodedAddresses = customEncodeAddresses(allowedAddresses);
      await setScreenerConfig(universalProfile, forwarderAddress, [await addressListChecker.getAddress()], LSP7_TYPEID, [encodedAddresses]);
      await setExecutiveConfig(universalProfile, forwarderAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 69)).to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(69);
    });

    it("should not pass transactions to executive when no addresses are configured", async function () {
      const upAddress = await universalProfile.getAddress();
      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([await forwarderAssistant.getAddress()]));
      await setScreenerConfig(universalProfile, await forwarderAssistant.getAddress(), [await addressListChecker.getAddress()], LSP7_TYPEID, ["0x"]);
      await setExecutiveConfig(universalProfile, await forwarderAssistant.getAddress(), ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7A.connect(lsp7Holder).mint(upAddress, 69)).to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(69);
    });
  });

  describe("CurationChecker", function () {
    it("should allow transaction when notifier is in the curated LSP8 list", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const curatedListAddress = await mockLSP8.getAddress();
      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([await forwarderAssistant.getAddress()]));

      const curatedEntryId = addressToBytes32(lsp7Address);
      await mockLSP8.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [curatedListAddress]);
      await setScreenerConfig(universalProfile, await forwarderAssistant.getAddress(), [await curationChecker.getAddress()], LSP7_TYPEID, [encodedConfig]);
      await setExecutiveConfig(universalProfile, await forwarderAssistant.getAddress(), ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7A.connect(owner).mint(upAddress, 1))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(await universalProfile.getAddress(), await forwarderAssistant.getAddress());
      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(1);
    });

    it("should block transaction when notifier is not in curated LSP8 list", async function () {
      const upAddress = await universalProfile.getAddress();
      const curatedListAddress = await mockLSP8.getAddress();
      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([await forwarderAssistant.getAddress()]));

      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [curatedListAddress]);
      await setScreenerConfig(universalProfile, await forwarderAssistant.getAddress(), [await curationChecker.getAddress()], LSP7_TYPEID, [encodedConfig]);
      await setExecutiveConfig(universalProfile, await forwarderAssistant.getAddress(), ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7B.connect(owner).mint(upAddress, 1)).to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7B.balanceOf(upAddress)).to.equal(1);
    });

    it("should block transaction when no curated list is configured", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([await forwarderAssistant.getAddress()]));

      const curatedEntryId = addressToBytes32(lsp7Address);
      await mockLSP8.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);
      await setScreenerConfig(universalProfile, await forwarderAssistant.getAddress(), [await curationChecker.getAddress()], LSP7_TYPEID, ["0x"]);
      await setExecutiveConfig(universalProfile, await forwarderAssistant.getAddress(), ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await expect(mockLSP7A.connect(owner).mint(upAddress, 1)).to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(1);
    });
  });
});