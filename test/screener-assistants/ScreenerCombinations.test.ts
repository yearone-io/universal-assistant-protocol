import { ethers } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";
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
} from "../../typechain-types";
import { deployUniversalProfile, deployMockAssets, setScreenerConfig, setExecutiveConfig } from "../utils/TestUtils";
import ERC725, { ERC725JSONSchema } from "@erc725/erc725.js";
import uap from '../../schemas/UAP.json';

describe("Screeners: Combinations", function () {
  let owner: Signer;
  let browserController: Signer;
  let lsp7Holder: Signer;
  let lsp8Holder: Signer;
  let nonOwner: Signer;
  let universalProfile: any;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let trueScreener: MockTrueScreenerAssistant;
  let falseScreener: MockFalseScreenerAssistant;
  let badScreener: MockBadScreenerAssistant;
  let configurableScreener: MockConfigurableScreenerAssistant;
  let forwarderAssistant: ForwarderAssistant;
  let burntPixAssistant: BurntPixRefinerAssistant;
  let tipAssistant: TipAssistant;
  let mockLSP7: any;
  let mockLSP8: any;
  let erc725UAP: ERC725;

  const LSP0_TYPEID = LSP1_TYPE_IDS.LSP0ValueReceived;
  const LSP7_TYPEID = LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification;
  const LSP8_TYPEID = LSP1_TYPE_IDS.LSP8Tokens_RecipientNotification;

  beforeEach(async function () {
    [owner, browserController, lsp7Holder, lsp8Holder, nonOwner] = await ethers.getSigners();
    ({ universalProfile, universalReceiverDelegateUAP } = await deployUniversalProfile(owner, browserController, [
      PERMISSIONS.SUPER_CALL, PERMISSIONS.SUPER_TRANSFERVALUE, PERMISSIONS.REENTRANCY
    ]));
    ({ lsp7: mockLSP7, lsp8: mockLSP8 } = await deployMockAssets(lsp7Holder));
    erc725UAP = new ERC725(uap as ERC725JSONSchema[], universalProfile.target, ethers.provider);

    const TrueScreenerFactory = await ethers.getContractFactory("MockTrueScreenerAssistant");
    trueScreener = await TrueScreenerFactory.deploy();
    const FalseScreenerFactory = await ethers.getContractFactory("MockFalseScreenerAssistant");
    falseScreener = await FalseScreenerFactory.deploy();
    const BadScreenerFactory = await ethers.getContractFactory("MockBadScreenerAssistant");
    badScreener = await BadScreenerFactory.deploy();
    const ConfigurableScreenerFactory = await ethers.getContractFactory("MockConfigurableScreenerAssistant");
    configurableScreener = await ConfigurableScreenerFactory.deploy();
    const ForwarderFactory = await ethers.getContractFactory("ForwarderAssistant");
    forwarderAssistant = await ForwarderFactory.deploy();
    const BurntPixFactory = await ethers.getContractFactory("BurntPixRefinerAssistant");
    burntPixAssistant = await BurntPixFactory.deploy();
    const TipFactory = await ethers.getContractFactory("TipAssistant");
    tipAssistant = await TipFactory.deploy();
  });

  describe("Executive and Screener Combinations", function () {
    it("should invoke ForwarderAssistant with TrueScreener for LSP7", async function () {
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAssistant.target]));
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAssistant.target, 0, [trueScreener.target], LSP7_TYPEID, ["0x"]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        forwarderAssistant.target,
        LSP7_TYPEID,
        0,
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await nonOwner.getAddress()])
      );
      await expect(
        mockLSP7.connect(lsp7Holder).mint(universalProfile.target, 1)
      ).to.emit(universalReceiverDelegateUAP, "AssistantInvoked").withArgs(universalProfile.target, forwarderAssistant.target);
      expect(await mockLSP7.balanceOf(await nonOwner.getAddress())).to.equal(1);
    });

    it("should skip ForwarderAssistant with FalseScreener for LSP7", async function () {
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [forwarderAssistant.target]));
      await setScreenerConfig(erc725UAP, universalProfile, forwarderAssistant.target, 0, [falseScreener.target], LSP7_TYPEID, ["0x"]);

      await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, 1);
      await expect(
        mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, 1, true, "0x")
      ).to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
      expect(await mockLSP7.balanceOf(await nonOwner.getAddress())).to.equal(0);
    });

    it("should invoke TipAssistant with ConfigurableScreener (true) for LYX", async function () {
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP0_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [tipAssistant.target]));
      await setScreenerConfig(erc725UAP, universalProfile, tipAssistant.target, 0, [configurableScreener.target], LSP0_TYPEID, [ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true])]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        tipAssistant.target,
        LSP0_TYPEID,
        0,
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [await nonOwner.getAddress(), 10])
      );

      const upAddr = universalProfile.target;
      const initialBalance = await ethers.provider.getBalance(await nonOwner.getAddress());
      await expect(owner.sendTransaction({ to: upAddr, value: ethers.parseEther("1") }))
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(upAddr, tipAssistant.target);
      expect(await ethers.provider.getBalance(await nonOwner.getAddress())).to.be.closeTo(initialBalance + ethers.parseEther("0.1"), ethers.parseEther("0.01"));
    });

    it("should skip TipAssistant with ConfigurableScreener (false) for LYX", async function () {
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP0_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [tipAssistant.target]));
      await setScreenerConfig(erc725UAP, universalProfile, tipAssistant.target, 0, [configurableScreener.target], LSP0_TYPEID, [ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [false])]);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        tipAssistant.target,
        LSP0_TYPEID,
        0,
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [await nonOwner.getAddress(), 10])
      );

      const upAddr = universalProfile.target;
      await expect(owner.sendTransaction({ to: upAddr, value: ethers.parseEther("1") })).to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
    });

    it("should handle multiple screeners with NO EXECUTION when ONE IS FALSE on AND CHAIN for TipAssistant", async function () {
      const mockUPAddress = universalProfile.target;
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP0_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [tipAssistant.target]));
      await setScreenerConfig(erc725UAP, universalProfile, tipAssistant.target, 0, [trueScreener.target, falseScreener.target, trueScreener.target], LSP0_TYPEID, ["0x", "0x", "0x"], true);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        tipAssistant.target,
        LSP0_TYPEID,
        0,
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [await nonOwner.getAddress(), 10])
      );
      const initialBalanceUP = await ethers.provider.getBalance(mockUPAddress);
      const initialBalanceNonOwner = await ethers.provider.getBalance(await nonOwner.getAddress());
      await owner.sendTransaction({ to: mockUPAddress, value: ethers.parseEther("1") });
      expect(await ethers.provider.getBalance(mockUPAddress)).to.equal(initialBalanceUP + ethers.parseEther("1"));
      expect(await ethers.provider.getBalance(await nonOwner.getAddress())).to.equal(initialBalanceNonOwner);
    });

    it("should handle multiple screeners with EXECUTION when ALL TRUE on AND CHAIN for TipAssistant", async function () {
      const mockUPAddress = universalProfile.target;
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP0_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [tipAssistant.target]));
      await setScreenerConfig(erc725UAP, universalProfile, tipAssistant.target, 0, [trueScreener.target, trueScreener.target, trueScreener.target], LSP0_TYPEID, ["0x", "0x", "0x"], true);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        tipAssistant.target,
        LSP0_TYPEID,
        0,
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [await nonOwner.getAddress(), 10])
      );
      const initialBalanceUP = await ethers.provider.getBalance(mockUPAddress);
      const initialBalanceNonOwner = await ethers.provider.getBalance(await nonOwner.getAddress());
      await owner.sendTransaction({ to: mockUPAddress, value: ethers.parseEther("1") });
      expect(await ethers.provider.getBalance(mockUPAddress)).to.equal(initialBalanceUP + ethers.parseEther("0.9"));
      expect(await ethers.provider.getBalance(await nonOwner.getAddress())).to.equal(initialBalanceNonOwner + ethers.parseEther("0.1"));
    });

    it("should handle multiple screeners with EXECUTION when ONE IS TRUE on OR CHAIN for TipAssistant", async function () {
      const mockUPAddress = universalProfile.target;
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP0_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [tipAssistant.target]));
      await setScreenerConfig(erc725UAP, universalProfile, tipAssistant.target, 0, [falseScreener.target, falseScreener.target, trueScreener.target, falseScreener.target], LSP0_TYPEID, ["0x", "0x", "0x", "0x"], false);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        tipAssistant.target,
        LSP0_TYPEID,
        0,
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [await nonOwner.getAddress(), 10])
      );
      const initialBalanceUP = await ethers.provider.getBalance(mockUPAddress);
      const initialBalanceNonOwner = await ethers.provider.getBalance(await nonOwner.getAddress());
      await owner.sendTransaction({ to: mockUPAddress, value: ethers.parseEther("1") });
      expect(await ethers.provider.getBalance(mockUPAddress)).to.equal(initialBalanceUP + ethers.parseEther("0.9"));
      expect(await ethers.provider.getBalance(await nonOwner.getAddress())).to.equal(initialBalanceNonOwner + ethers.parseEther("0.1"));
    });

    it("should handle multiple screeners with NO EXECUTION when ALL ARE FALSE on OR CHAIN for TipAssistant", async function () {
      const mockUPAddress = universalProfile.target;
      const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP0_TYPEID]);
      await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [tipAssistant.target]));
      await setScreenerConfig(erc725UAP, universalProfile, tipAssistant.target, 0, [falseScreener.target, falseScreener.target, falseScreener.target], LSP0_TYPEID, ["0x", "0x", "0x"], false);
      await setExecutiveConfig(
        erc725UAP,
        universalProfile,
        tipAssistant.target,
        LSP0_TYPEID,
        0,
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [await nonOwner.getAddress(), 10])
      );
      const initialBalanceUP = await ethers.provider.getBalance(mockUPAddress);
      const initialBalanceNonOwner = await ethers.provider.getBalance(await nonOwner.getAddress());
      await owner.sendTransaction({ to: mockUPAddress, value: ethers.parseEther("1") });
      expect(await ethers.provider.getBalance(mockUPAddress)).to.equal(initialBalanceUP + ethers.parseEther("1"));
      expect(await ethers.provider.getBalance(await nonOwner.getAddress())).to.equal(initialBalanceNonOwner);
    });
  });
});