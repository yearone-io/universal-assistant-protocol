import { ethers } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";
import { LSP1_TYPE_IDS, PERMISSIONS } from "@lukso/lsp-smart-contracts";
import {
  UniversalReceiverDelegateUAP,
  BurntPixRefinerAssistant,
  TipAssistant,
  MockBurntPixRegistry,
} from "../../typechain-types";
import { deployUniversalProfile, deployMockAssets, encodeTupleKeyValue } from "../utils/TestUtils";
import ERC725, { ERC725JSONSchema } from "@erc725/erc725.js";
import uap from '../../schemas/UAP.json';

describe("Executives: BurntPixRefinerAssistant & Mixed Assistants", function () {
  let owner: Signer;
  let browserController: Signer;
  let lsp7Holder: Signer;
  let lsp8Holder: Signer;
  let universalProfile: any;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let burntPixAssistant: BurntPixRefinerAssistant;
  let tipAssistant: TipAssistant;
  let mockRegistry: MockBurntPixRegistry;
  let mockLSP7: any;
  let mockLSP8: any;
  let erc725UAP: ERC725;

  const LSP0_VALUE_RECEIVED = LSP1_TYPE_IDS.LSP0ValueReceived;
  const LSP7_TYPEID = LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification;
  const LSP8_TYPEID = LSP1_TYPE_IDS.LSP8Tokens_RecipientNotification;

  beforeEach(async function () {
    [owner, browserController, lsp7Holder, lsp8Holder] = await ethers.getSigners();
    ({ universalProfile, universalReceiverDelegateUAP } = await deployUniversalProfile(owner, browserController, [
      PERMISSIONS.SUPER_CALL, PERMISSIONS.SUPER_TRANSFERVALUE, PERMISSIONS.REENTRANCY
    ]));
    ({ lsp7: mockLSP7, lsp8: mockLSP8 } = await deployMockAssets(lsp7Holder));
    erc725UAP = new ERC725(uap as ERC725JSONSchema[], universalProfile.target, ethers.provider);

    const BurntPixFactory = await ethers.getContractFactory("BurntPixRefinerAssistant");
    burntPixAssistant = await BurntPixFactory.deploy();
    const TipAssistantFactory = await ethers.getContractFactory("TipAssistant");
    tipAssistant = await TipAssistantFactory.deploy();
    const RegistryFactory = await ethers.getContractFactory("MockBurntPixRegistry");
    mockRegistry = await RegistryFactory.deploy();
  });

  async function subscribeBurntPixFor(typeIds: string[]) {
    for (const tId of typeIds) {
      const key = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [tId]);
      const value = erc725UAP.encodeValueType("address[]", [burntPixAssistant.target]);
      await universalProfile.setData(key, value);
    }
  }

  async function setBurntPixConfig(typeId: string, execOrder: number, registryAddr: string, pixId: string, iters: number) {
    const execKey = erc725UAP.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [typeId, execOrder.toString()]);
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32", "uint256"], [registryAddr, pixId, iters]);
    const execData = encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [burntPixAssistant.target, encoded]);
    await universalProfile.setData(execKey, execData);
  }

  it("subscribe BurntPix with only LYX type, send LYX => refine called", async function () {
    await subscribeBurntPixFor([LSP0_VALUE_RECEIVED]);
    const pixId = "0x1234000000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(LSP0_VALUE_RECEIVED, 0, mockRegistry.target, pixId, 2);
    await expect(owner.sendTransaction({ to: universalProfile.target, value: ethers.parseEther("1") }))
      .to.emit(mockRegistry, "Refined")
      .withArgs(pixId, 2);
  });

  it("subscribe BurntPix with only LYX type, send LSP7 => no refine triggered", async function () {
    await subscribeBurntPixFor([LSP0_VALUE_RECEIVED]);
    const pixId = "0x1234000000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(LSP0_VALUE_RECEIVED, 0, mockRegistry.target, pixId, 3);
    await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, 10);
    await expect(
      mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, 10, true, "0x")
    ).to.not.emit(mockRegistry, "Refined");
  });

  it("subscribe BurntPix with only LSP7 type, send LSP7 => refine triggered", async function () {
    await subscribeBurntPixFor([LSP7_TYPEID]);
    const pixId = "0xabcd000000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(LSP7_TYPEID, 0, mockRegistry.target, pixId, 2);
    await mockLSP7.connect(lsp7Holder).mint(lsp7Holder, 7);
    await expect(
      mockLSP7.connect(lsp7Holder).transfer(await lsp7Holder.getAddress(), universalProfile.target, 7, true, "0x")
    ).to.emit(mockRegistry, "Refined").withArgs(pixId, 2);
  });

  it("subscribe BurntPix with only LSP8 type, send LSP8 => refine triggered", async function () {
    await subscribeBurntPixFor([LSP8_TYPEID]);
    const pixId = "0xaaaa000000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(LSP8_TYPEID, 0, mockRegistry.target, pixId, 9);
    const tokenId = ethers.toBeHex(101, 32);
    await mockLSP8.connect(lsp8Holder).mint(lsp8Holder, tokenId);
    await expect(
      mockLSP8.connect(lsp8Holder).transfer(await lsp8Holder.getAddress(), universalProfile.target, tokenId, true, "0x")
    ).to.emit(mockRegistry, "Refined").withArgs(pixId, 9);
  });

  it("subscribe TipAssistant + BurntPix (for LYX), send LYX => both triggered", async function () {
    // config assistants for tx type
    const tipExecOrder = 0;
    const burntPixExecOrder = 1;
    const typeKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP0_VALUE_RECEIVED]);
    await universalProfile.setData(typeKey, erc725UAP.encodeValueType("address[]", [tipAssistant.target, burntPixAssistant.target]));
    
    // config tip assistant exec; key is execAddress + order
    const tipExecKey = erc725UAP.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [LSP0_VALUE_RECEIVED, tipExecOrder.toString()]);
    const encodedTipConfig = ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [await owner.getAddress(), 10]);
    const encodedTipExecData = encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [tipAssistant.target, encodedTipConfig]);
    await universalProfile.setData(tipExecKey, encodedTipExecData);

    // config burnt pix assistant exec
    const pixId = "0x9998880000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(LSP0_VALUE_RECEIVED, burntPixExecOrder, mockRegistry.target, pixId, 1);

    //
    const tx = owner.sendTransaction({ to: universalProfile.target, value: ethers.parseEther("1") });
    await expect(tx).to.emit(mockRegistry, "Refined").withArgs(pixId, 1);
    await expect(tx).to.emit(universalReceiverDelegateUAP, "AssistantInvoked").withArgs(universalProfile.target, burntPixAssistant.target);
    await expect(tx).to.emit(universalReceiverDelegateUAP, "AssistantInvoked").withArgs(universalProfile.target, tipAssistant.target);
  });

  it("should mint LSP7 tokens via UP and trigger BurntPixRefinerAssistant for LSP7", async function () {
    const typeMappingKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP7_TYPEID]);
    await universalProfile.setData(
      typeMappingKey,
      erc725UAP.encodeValueType("address[]", [burntPixAssistant.target])
    );
    const pixId = "0x9998880000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(LSP7_TYPEID, 0, mockRegistry.target, pixId, 2);

    const mintPayload = mockLSP7.interface.encodeFunctionData("mint", [universalProfile.target, 1]);
    await expect(
      universalProfile.connect(owner).execute(0, mockLSP7.target, 0, mintPayload)
    ).to.emit(mockRegistry, "Refined").withArgs(pixId, 2);
  });
});