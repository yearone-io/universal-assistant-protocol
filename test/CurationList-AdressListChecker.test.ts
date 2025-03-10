import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { LSP1_TYPE_IDS, PERMISSIONS } from "@lukso/lsp-smart-contracts";
import LSP8Enumerable from '@lukso/lsp8-contracts/artifacts/LSP8Enumerable.json';
import {
  UniversalReceiverDelegateUAP,
  AddressListChecker,
  CurationChecker,
  ForwarderAssistant,
  MockLSP7DigitalAsset,
  MockLSP8IdentifiableDigitalAsset,
} from "../typechain-types";
import {
  setupProfileWithKeyManagerWithURD,
  grantBrowserExtensionUrdSetPermissions,
  setLSP1UniversalReceiverDelegate,
} from "./up-utils";
import { customEncodeAddresses } from "./helpers/encoding";
import { generateExecutiveScreenersKey, generateMappingKey, generateScreenerConfigKey } from "./UAP.test";

describe("Screener Assistants Tests", function () {
  let owner: Signer;
  let browserController: Signer;
  let lsp7Holder: Signer;
  let nonOwner: Signer;
  let universalProfile: any;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let addressListChecker: AddressListChecker;
  let addressListCheckerAddress: string;
  let CurationChecker: CurationChecker;
  let curationCheckerAddress: string;
  let forwarderAssistant: ForwarderAssistant;
  let forwarderAssistantAddress: string;
  let mockLSP7A: MockLSP7DigitalAsset;
  let mockLSP7B: MockLSP7DigitalAsset;
  let mockLSP8: MockLSP8IdentifiableDigitalAsset;
  let mockLSP8Unused: MockLSP8IdentifiableDigitalAsset;
  let mockLSP8UnusedAddress: string;
  let mockLSP8Address: string;

  const LSP7_TYPEID = LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification;

  beforeEach(async function () {
    [owner, browserController, lsp7Holder, nonOwner] = await ethers.getSigners();

    // Setup UP with URD
    [universalProfile] = await setupProfileWithKeyManagerWithURD(owner, browserController);
    await grantBrowserExtensionUrdSetPermissions(owner, browserController, universalProfile);
    [universalReceiverDelegateUAP] = await setLSP1UniversalReceiverDelegate(
      browserController,
      universalProfile,
      [PERMISSIONS.SUPER_CALL, PERMISSIONS.REENTRANCY]
    );

    // Deploy screener assistants
    const AddressListCheckerFactory = await ethers.getContractFactory("AddressListChecker");
    addressListChecker = await AddressListCheckerFactory.deploy();
    addressListCheckerAddress = (await addressListChecker.getAddress()).toLowerCase();

    const CurationCheckerFactory = await ethers.getContractFactory("CurationChecker");
    CurationChecker = await CurationCheckerFactory.deploy();
    curationCheckerAddress = (await CurationChecker.getAddress()).toLowerCase();

    // Deploy forwarder assistant for testing
    const ForwarderFactory = await ethers.getContractFactory("ForwarderAssistant");
    forwarderAssistant = await ForwarderFactory.deploy();
    forwarderAssistantAddress = await forwarderAssistant.getAddress();

    // Deploy mock assets
    const MockLSP7Factory = await ethers.getContractFactory("MockLSP7DigitalAsset");
    mockLSP7A = await MockLSP7Factory.deploy("Mock LSP7", "MLSP7", await lsp7Holder.getAddress());
    mockLSP7B = await MockLSP7Factory.deploy("Mock LSP7", "MLSP7", await lsp7Holder.getAddress());
    
    const MockLSP8Factory = await ethers.getContractFactory("MockLSP8IdentifiableDigitalAsset");
    mockLSP8 = await MockLSP8Factory.deploy("Mock LSP8", "MLSP8", await lsp7Holder.getAddress());
    mockLSP8Address = await mockLSP8.getAddress();
    mockLSP8Unused = await MockLSP8Factory.deploy("Mock LSP8", "MLSP8", await lsp7Holder.getAddress());
    mockLSP8UnusedAddress = await mockLSP8.getAddress();
  });

  async function setScreenerConfig(
    up: any,
    executive: string,
    screener: string,
    typeId: string,
    config: string
  ) {
    const screenerKey = generateExecutiveScreenersKey(typeId, executive);
    await up.setData(screenerKey, customEncodeAddresses([screener]));
    if (config.length > 0) {
      await up.setData(generateScreenerConfigKey(typeId, executive, screener), config);
    }
  }

  async function setExecutiveConfig(up: any, executive: string, config: string) {
    const configKey = generateMappingKey("UAPExecutiveConfig", executive);
    await up.setData(configKey, config);
  }

  describe("AddressListChecker", function () {
    it("should allow transaction when notifier is in address list", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAssistantAddress]));

      // Configure AddressListChecker with allowed addresses
      const allowedAddresses = [lsp7Address];
      const encodedAddresses = customEncodeAddresses(allowedAddresses);
      await setScreenerConfig(
        universalProfile,
        forwarderAssistantAddress,
        addressListCheckerAddress,
        LSP7_TYPEID,
        encodedAddresses
      );

      // Set forwarder target
      await setExecutiveConfig(
        universalProfile,
        forwarderAssistantAddress,
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()])
      );

      // Perform LSP7 transfer
      await expect(
        mockLSP7A.connect(lsp7Holder).mint(upAddress, 69)
      )
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(await universalProfile.getAddress(), forwarderAssistantAddress);

      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(69);
    });

    it("should not pass transactions to executive when notifier is not in address list", async function () {
      const upAddress = await universalProfile.getAddress();
      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAssistantAddress]));

      // Configure AddressListChecker with different allowed addresses
      const allowedAddresses = [await nonOwner.getAddress()];
      const encodedAddresses = customEncodeAddresses(allowedAddresses);
      await setScreenerConfig(
        universalProfile,
        forwarderAssistantAddress,
        addressListCheckerAddress,
        LSP7_TYPEID,
        encodedAddresses
      );

      // Set forwarder target
      await setExecutiveConfig(
        universalProfile,
        forwarderAssistantAddress,
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()])
      );

      await expect(
        mockLSP7A.connect(lsp7Holder).mint(upAddress, 69)
      ).to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");

      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(69);
    });

    it("should not pass transactions to executive when no addresses are configured", async function () {
        const upAddress = await universalProfile.getAddress();
        const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
        await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAssistantAddress]));
        await setScreenerConfig(
          universalProfile,
          forwarderAssistantAddress,
          addressListCheckerAddress,
          LSP7_TYPEID,
          "0x"
        );
  
        // Set forwarder target
        await setExecutiveConfig(
          universalProfile,
          forwarderAssistantAddress,
          ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()])
        );
  
        await expect(
          mockLSP7A.connect(lsp7Holder).mint(upAddress, 69)
        ).to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
  
        expect(await mockLSP7A.balanceOf(upAddress)).to.equal(69);
    });
  });

  describe("CurationChecker", function () {
    it("should allow transaction when notifier is in the curated LSP8 list", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const curatedList = mockLSP8;
      const curatedListAddress = mockLSP8Address;
      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAssistantAddress]));

      // Mint LSP8 token for lsp7Holder address
      const curatedEntryId = addressToBytes32(lsp7Address);
      await curatedList.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);

      // Configure CurationChecker with LSP8 address
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address"],
        [curatedListAddress]
      );
      await setScreenerConfig(
        universalProfile,
        forwarderAssistantAddress,
        curationCheckerAddress,
        LSP7_TYPEID,
        encodedConfig
      );

      // Set forwarder target
      await setExecutiveConfig(
        universalProfile,
        forwarderAssistantAddress,
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()])
      );

      // Perform LSP7 mint
      await expect(
        mockLSP7A.connect(owner).mint(upAddress, 1)
      )
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(await universalProfile.getAddress(), forwarderAssistantAddress);

      expect(await mockLSP7A.balanceOf(await nonOwner.getAddress())).to.equal(1);
    });

    it("should block transaction when notifier is not in curated LSP8 list", async function () {
      const upAddress = await universalProfile.getAddress();
      const curatedListAddress = mockLSP8Address;
      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAssistantAddress]));

      // Configure CurationChecker with LSP8 address
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address"],
        [curatedListAddress]
      );
      await setScreenerConfig(
        universalProfile,
        forwarderAssistantAddress,
        curationCheckerAddress,
        LSP7_TYPEID,
        encodedConfig
      );

      // Set forwarder target
      await setExecutiveConfig(
        universalProfile,
        forwarderAssistantAddress,
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()])
      );

      // Perform LSP7 mint
      await expect(
        mockLSP7B.connect(owner).mint(upAddress, 1)
      )
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");

      expect(await mockLSP7B.balanceOf(upAddress)).to.equal(1);
    });

    it("should block transaction when no curated list is configured", async function () {
      const upAddress = await universalProfile.getAddress();
      const lsp7Address = await mockLSP7A.getAddress();
      const curatedList = mockLSP8;
      const curatedListAddress = mockLSP8Address;
      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAssistantAddress]));

      // Mint LSP8 token for lsp7Holder address
      const curatedEntryId = addressToBytes32(lsp7Address);
      await curatedList.connect(lsp7Holder).mint(lsp7Address, curatedEntryId);

      // Configure CurationChecker with LSP8 address
      const screenerKey = generateExecutiveScreenersKey(LSP7_TYPEID, forwarderAssistantAddress);
      await universalProfile.setData(screenerKey, customEncodeAddresses([curationCheckerAddress]));

      // Set forwarder target
      await setExecutiveConfig(
        universalProfile,
        forwarderAssistantAddress,
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()])
      );

      // Perform LSP7 mint
      await expect(
        mockLSP7A.connect(owner).mint(upAddress, 1)
      )
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");

      expect(await mockLSP7A.balanceOf(upAddress)).to.equal(1);
    });
  });
});

export function addressToBytes32(address: string) {
    // Remove the '0x' prefix if present
    if (address.startsWith('0x')) {
      address = address.slice(2);
    }
    // Pad the address with leading zeros to make it 32 bytes (64 hex characters)
    const paddedAddress = '0'.repeat(64 - address.length) + address;
    // Add the '0x' prefix back and return the result
    return '0x' + paddedAddress.toLowerCase();
  }

