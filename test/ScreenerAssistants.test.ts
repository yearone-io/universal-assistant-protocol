import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { LSP1_TYPE_IDS, PERMISSIONS } from "@lukso/lsp-smart-contracts";
import {
  UniversalReceiverDelegateUAP,
  MockTrueScreenerAssistant,
  MockFalseScreenerAssistant,
  MockBadScreenerAssistant,
  MockConfigurableScreenerAssistant,
  ForwarderAssistant,
  BurntPixRefinerAssistant,
  TipAssistant,
  MockLSP7DigitalAsset,
  MockLSP8IdentifiableDigitalAsset,
  MockBurntPixRegistry,
} from "../typechain-types";
import {
  setupProfileWithKeyManagerWithURD,
  grantBrowserExtensionUrdSetPermissions,
  setLSP1UniversalReceiverDelegate,
} from "./up-utils";
import { customEncodeAddresses } from "./helpers/encoding";
import { generateExecutiveScreenersKey, generateMappingKey, generateScreenerConfigKey } from "./UAP.test";

describe("UniversalReceiverDelegateUAP", function () {
  let owner: Signer;
  let browserController: Signer;
  let lsp7Holder: Signer;
  let lsp8Holder: Signer;
  let nonOwner: Signer;
  let universalProfile: any;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let trueScreener: MockTrueScreenerAssistant;
  let trueScreenerAddress: string;
  let falseScreener: MockFalseScreenerAssistant;
  let falseScreenerAddress: string;
  let badScreener: MockBadScreenerAssistant;
  let badScreenerAddress: string;
  let configurableScreener: MockConfigurableScreenerAssistant;
  let configurableScreenerAddress: string;
  let forwarderAssistant: ForwarderAssistant;
  let forwarderAssistantAddress: string;
  let burntPixAssistant: BurntPixRefinerAssistant;
  let burntPixAssistantAddress: string;
  let tipAssistant: TipAssistant;
  let tipAssistantAddress: string;
  let mockRegistry: MockBurntPixRegistry;
  let mockLSP7: MockLSP7DigitalAsset;
  let mockLSP8: MockLSP8IdentifiableDigitalAsset;

  const LSP0_TYPEID = LSP1_TYPE_IDS.LSP0ValueReceived;
  const LSP7_TYPEID = LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification;
  const LSP8_TYPEID = LSP1_TYPE_IDS.LSP8Tokens_RecipientNotification;
  const CUSTOM_TYPEID = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";

  beforeEach(async function () {
    [owner, browserController, lsp7Holder, lsp8Holder, nonOwner] = await ethers.getSigners();

    const [up] = await setupProfileWithKeyManagerWithURD(owner, browserController);
    universalProfile = up;

    await grantBrowserExtensionUrdSetPermissions(owner, browserController, universalProfile);
    [universalReceiverDelegateUAP] = await setLSP1UniversalReceiverDelegate(
      browserController,
      universalProfile,
      [PERMISSIONS.SUPER_CALL, PERMISSIONS.SUPER_TRANSFERVALUE, PERMISSIONS.REENTRANCY]
    );

    // Deploy screeners
    const TrueScreenerFactory = await ethers.getContractFactory("MockTrueScreenerAssistant");
    trueScreener = await TrueScreenerFactory.deploy();
    trueScreenerAddress = (await trueScreener.getAddress()).toLowerCase();
    const FalseScreenerFactory = await ethers.getContractFactory("MockFalseScreenerAssistant");
    falseScreener = await FalseScreenerFactory.deploy();
    falseScreenerAddress = (await falseScreener.getAddress()).toLowerCase();
    const BadScreenerFactory = await ethers.getContractFactory("MockBadScreenerAssistant");
    badScreener = await BadScreenerFactory.deploy();
    badScreenerAddress = (await badScreener.getAddress()).toLowerCase();
    const ConfigurableScreenerFactory = await ethers.getContractFactory("MockConfigurableScreenerAssistant");
    configurableScreener = await ConfigurableScreenerFactory.deploy();
    configurableScreenerAddress = (await configurableScreener.getAddress()).toLowerCase();

    // Deploy executives
    const ForwarderFactory = await ethers.getContractFactory("ForwarderAssistant");
    forwarderAssistant = await ForwarderFactory.deploy();
    forwarderAssistantAddress = await forwarderAssistant.getAddress();
    const BurntPixFactory = await ethers.getContractFactory("BurntPixRefinerAssistant");
    burntPixAssistant = await BurntPixFactory.deploy();
    burntPixAssistantAddress = (await burntPixAssistant.getAddress()).toLowerCase();
    const TipFactory = await ethers.getContractFactory("TipAssistant");
    tipAssistant = await TipFactory.deploy();
    tipAssistantAddress = await tipAssistant.getAddress();

    // Deploy mocks
    const RegistryFactory = await ethers.getContractFactory("MockBurntPixRegistry");
    mockRegistry = await RegistryFactory.deploy();
    const MockLSP7Factory = await ethers.getContractFactory("MockLSP7DigitalAsset");
    mockLSP7 = await MockLSP7Factory.deploy("Mock LSP7", "MLSP7", await lsp7Holder.getAddress());
    const MockLSP8Factory = await ethers.getContractFactory("MockLSP8IdentifiableDigitalAsset");
    mockLSP8 = await MockLSP8Factory.deploy("Mock LSP8", "MLSP8", await lsp8Holder.getAddress());
  });

  async function setScreenerConfig(up: any, executive: string, screener: string, typeId: string, config: string) {
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
  describe("Executive and Screener Combinations", function () {
    it("should invoke ForwarderAssistant with TrueScreener for LSP7", async function () {
      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAssistantAddress]));
      await setScreenerConfig(universalProfile, forwarderAssistantAddress, trueScreenerAddress, LSP7_TYPEID, "0x");
      await setExecutiveConfig(universalProfile, forwarderAssistantAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));

      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, 1);
      await expect(
        mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), await universalProfile.getAddress(), 1, true, "0x")
      ).to.emit(universalReceiverDelegateUAP, "AssistantInvoked").withArgs(await universalProfile.getAddress(), await forwarderAssistantAddress);
      expect(await mockLSP7.balanceOf(await nonOwner.getAddress())).to.equal(1);
    });

    it("should skip ForwarderAssistant with FalseScreener for LSP7", async function () {
      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([forwarderAssistantAddress]));
      await setScreenerConfig(universalProfile, forwarderAssistantAddress, falseScreenerAddress, LSP7_TYPEID, "0x");

      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, 1);
      await expect(
        mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), await universalProfile.getAddress(), 1, true, "0x")
      ).to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7.balanceOf(await nonOwner.getAddress())).to.equal(0);
    });

    it("should revert with BadScreener for BurntPixAssistant with LSP8", async function () {
      const typeKey = generateMappingKey("UAPTypeConfig", LSP8_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([burntPixAssistantAddress]));
      await setScreenerConfig(universalProfile, burntPixAssistantAddress, badScreenerAddress, LSP8_TYPEID, "0x");
      const pixId = "0x1234000000000000000000000000000000000000000000000000000000000000";
      const iters = 2;
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "bytes32", "uint256"],
        [await mockRegistry.getAddress(), pixId, iters]
      );
      await setExecutiveConfig(universalProfile, burntPixAssistantAddress, encodedConfig);

      const tokenId = ethers.toBeHex(1, 32);
      await mockLSP8.connect(lsp8Holder).mint(lsp8Holder, tokenId);
      await expect(
        mockLSP8.connect(lsp8Holder).transfer(await lsp8Holder.getAddress(), await universalProfile.getAddress(), tokenId, true, "0x")
      ).to.be.reverted;
    });

    it("should invoke TipAssistant with ConfigurableScreener (true) for LYX", async function () {
      const typeKey = generateMappingKey("UAPTypeConfig", LSP0_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([tipAssistantAddress]));
      await setScreenerConfig(universalProfile, tipAssistantAddress, configurableScreenerAddress, LSP0_TYPEID, ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]));
      await setExecutiveConfig(universalProfile, tipAssistantAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [await nonOwner.getAddress(), 10]));

      const upAddr = await universalProfile.getAddress();
      const initialBalance = await ethers.provider.getBalance(await nonOwner.getAddress());
      await expect(owner.sendTransaction({ to: upAddr, value: ethers.parseEther("1") }))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddr, tipAssistantAddress);
      // Tip is 10% of 1 ETH = 0.1 ETH
      expect(await ethers.provider.getBalance(await nonOwner.getAddress())).to.be.closeTo(initialBalance + ethers.parseEther("0.1"), ethers.parseEther("0.01"));
    });

    it("should skip TipAssistant with ConfigurableScreener (false) for LYX", async function () {
      const typeKey = generateMappingKey("UAPTypeConfig", LSP0_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([await tipAssistant.getAddress()]));
      await setScreenerConfig(universalProfile, tipAssistantAddress, await configurableScreener.getAddress(), LSP0_TYPEID, ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [false]));
      await setExecutiveConfig(universalProfile, tipAssistantAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [await nonOwner.getAddress(), 10]));

      const upAddr = await universalProfile.getAddress();
      expect(await owner.sendTransaction({ to: upAddr, value: ethers.parseEther("1") })).to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
    }); 

    it("should chain Forwarder and BurntPixRefiner with TrueScreener for lsp7recipient typeId", async function () {
        const mockUPAddress = await universalProfile.getAddress();
        const targetAddress = await nonOwner.getAddress();
        const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
        await universalProfile.setData(typeKey, customEncodeAddresses([burntPixAssistantAddress, forwarderAssistantAddress]));
        await setScreenerConfig(universalProfile, burntPixAssistantAddress, trueScreenerAddress, LSP7_TYPEID, "0x");
        await setScreenerConfig(universalProfile, forwarderAssistantAddress, trueScreenerAddress, LSP7_TYPEID, "0x");
        await setExecutiveConfig(universalProfile, forwarderAssistantAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));
        const pixId = "0x1234000000000000000000000000000000000000000000000000000000000000";
        const iters = 2;
        const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "bytes32", "uint256"],
          [await mockRegistry.getAddress(), pixId, iters]
        );
        await setExecutiveConfig(universalProfile, burntPixAssistantAddress, encodedConfig);
        const tx = await mockLSP7.connect(lsp7Holder).mint(mockUPAddress, 1);
        await tx.wait();
        const balance = await mockLSP7.balanceOf(targetAddress);
        expect(balance).to.equal(1);
      });

    it("should stop at FalseScreener with multiple executives for custom typeId", async function () {
      const mockUPAddress = await universalProfile.getAddress();
      const targetAddress = await nonOwner.getAddress();
      const typeKey = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([burntPixAssistantAddress, forwarderAssistantAddress]));
      await setScreenerConfig(universalProfile, burntPixAssistantAddress, trueScreenerAddress, LSP7_TYPEID, "0x");
      await setScreenerConfig(universalProfile, forwarderAssistantAddress, falseScreenerAddress, LSP7_TYPEID, "0x");
      await setExecutiveConfig(universalProfile, forwarderAssistantAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()]));
      const pixId = "0x1234000000000000000000000000000000000000000000000000000000000000";
      const iters = 2;
      const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "bytes32", "uint256"],
        [await mockRegistry.getAddress(), pixId, iters]
      );
      await setExecutiveConfig(universalProfile, burntPixAssistantAddress, encodedConfig);

      expect(await mockLSP7.connect(lsp7Holder).mint(mockUPAddress, 1)).to.emit(universalReceiverDelegateUAP, "AssistantInvoked").withArgs(mockUPAddress, burntPixAssistantAddress);
      const balance = await mockLSP7.balanceOf(targetAddress);
      expect(balance).to.equal(0);
    });

    it("should handle multiple screeners with mixed outcomes for TipAssistant", async function () {
      const mockUPAddress = await universalProfile.getAddress();
      const typeKey = generateMappingKey("UAPTypeConfig", LSP0_TYPEID);
      await universalProfile.setData(typeKey, customEncodeAddresses([tipAssistantAddress]));
      await setScreenerConfig(universalProfile, tipAssistantAddress, trueScreenerAddress, LSP0_TYPEID, "0x");
      await setScreenerConfig(universalProfile, tipAssistantAddress, falseScreenerAddress, LSP0_TYPEID, "0x");
      await setExecutiveConfig(universalProfile, tipAssistantAddress, ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [await nonOwner.getAddress(), 10]));
      const initialBalanceUP = await ethers.provider.getBalance(mockUPAddress);
      const initialBalanceNonOwner = await ethers.provider.getBalance(await nonOwner.getAddress());
      await owner.sendTransaction({ to: mockUPAddress, value: ethers.parseEther("1") });
      expect(await ethers.provider.getBalance(mockUPAddress)).to.equal(initialBalanceUP + ethers.parseEther("1"));
      expect(await ethers.provider.getBalance(await nonOwner.getAddress())).to.equal(initialBalanceNonOwner);
    });
  });
});