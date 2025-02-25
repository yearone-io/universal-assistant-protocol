import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";
import {
  UniversalProfile,
  UniversalReceiverDelegateUAP,
} from "../typechain-types";
import {
  BurntPixRefinerAssistant,
} from "../typechain-types/contracts/executive-assistants/BurntPixRefinerAssistant.sol";
import { TipAssistant } from "../typechain-types/contracts/executive-assistants/TipAssistant.sol";
import { MockBurntPixRegistry } from "../typechain-types/contracts/mocks/MockBurntPixRegistry";
import { MockLSP7DigitalAsset, MockLSP8IdentifiableDigitalAsset } from "../typechain-types";
import {
  setupProfileWithKeyManagerWithURD,
  grantBrowserExtensionUrdSetPermissions,
  setLSP1UniversalReceiverDelegate,
} from "./up-utils";
import {
  LSP1_TYPE_IDS,
  PERMISSIONS,
} from "@lukso/lsp-smart-contracts";
import { customEncodeAddresses } from "./helpers/encoding";

export function generateMappingKey(keyName: string, typeId: string): string {
  const hashedKey = ethers.keccak256(ethers.toUtf8Bytes(keyName));
  const first10Bytes = hashedKey.slice(2, 22);
  const last20Bytes = typeId.slice(2, 42);
  return "0x" + first10Bytes + "0000" + last20Bytes;
}

describe("BurntPixRefinerAssistant & Mixed Assistants", function () {
  let owner: Signer;
  let browserController: Signer;
  let LSP7Holder: Signer;
  let LSP8Holder: Signer;
  let universalProfile: UniversalProfile;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let burntPixAssistant: BurntPixRefinerAssistant;
  let tipAssistant: TipAssistant;
  let mockRegistry: MockBurntPixRegistry;
  let mockLSP7: MockLSP7DigitalAsset;
  let mockLSP8: MockLSP8IdentifiableDigitalAsset;

  const LSP0_VALUE_RECEIVED = LSP1_TYPE_IDS.LSP0ValueReceived;
  const LSP7_TYPEID = LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification;
  const LSP8_TYPEID = LSP1_TYPE_IDS.LSP8Tokens_RecipientNotification;

  beforeEach(async () => {
    [owner, browserController, LSP7Holder, LSP8Holder] = await ethers.getSigners();

    const [up] = await setupProfileWithKeyManagerWithURD(owner, browserController);
    universalProfile = up;

    // IMPORTANT: The TipAssistant requires transferring LYX from the UP,
    // so we must give the URD SUPER_TRANSFERVALUE in addition to SUPER_CALL
    await grantBrowserExtensionUrdSetPermissions(owner, browserController, universalProfile);

    [universalReceiverDelegateUAP] = await setLSP1UniversalReceiverDelegate(
      browserController,
      universalProfile,
      [PERMISSIONS.SUPER_CALL, PERMISSIONS.SUPER_TRANSFERVALUE]
    );

    const BurntPixFactory = await ethers.getContractFactory("BurntPixRefinerAssistant");
    burntPixAssistant = (await BurntPixFactory.deploy()) as BurntPixRefinerAssistant;

    const TipAssistantFactory = await ethers.getContractFactory("TipAssistant");
    tipAssistant = (await TipAssistantFactory.deploy()) as TipAssistant;

    const RegistryFactory = await ethers.getContractFactory("MockBurntPixRegistry");
    mockRegistry = (await RegistryFactory.deploy()) as MockBurntPixRegistry;

    const MockLSP7Factory = await ethers.getContractFactory("MockLSP7DigitalAsset");
    mockLSP7 = (await MockLSP7Factory.deploy(
      "Mock LSP7 Token",
      "MLSP7",
      await LSP7Holder.getAddress(),
    )) as MockLSP7DigitalAsset;

    const MockLSP8Factory = await ethers.getContractFactory("MockLSP8IdentifiableDigitalAsset");
    mockLSP8 = (await MockLSP8Factory.deploy(
      "Mock LSP8 Token",
      "MLSP8",
      await LSP8Holder.getAddress(),
    )) as MockLSP8IdentifiableDigitalAsset;
  });

  async function subscribeBurntPixFor(typeIds: string[]) {
    for (const tId of typeIds) {
      const key = generateMappingKey("UAPTypeConfig", tId);
      const encoded = customEncodeAddresses([await burntPixAssistant.getAddress()]);
      await universalProfile.setData(key, encoded);
    }
  }

  async function setBurntPixConfig(registryAddr: string, pixId: string, iters: number) {
    const execKey = generateMappingKey("UAPExecutiveConfig", await burntPixAssistant.getAddress());
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address","bytes32","uint256"],
      [registryAddr, pixId, iters]
    );
    await universalProfile.setData(execKey, encoded);
  }

  async function subscribeTipForLYX(tipPerc: number, tipRecipient: string) {
    const tipAddr = await tipAssistant.getAddress();
    const typeKey = generateMappingKey("UAPTypeConfig", LSP0_VALUE_RECEIVED);
    const encodedAssistants = customEncodeAddresses([tipAddr]);
    await universalProfile.setData(typeKey, encodedAssistants);

    const configKey = generateMappingKey("UAPExecutiveConfig", tipAddr);
    const instructions = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address","uint256"],
      [tipRecipient, tipPerc]
    );
    await universalProfile.setData(configKey, instructions);
  }

  it("subscribe BurntPix with only LYX type, send LYX => refine called", async () => {
    await subscribeBurntPixFor([LSP0_VALUE_RECEIVED]);
    // Must be 32 bytes
    const pixId = "0x1234000000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(mockRegistry.target, pixId, 2);

    const upAddr = await universalProfile.getAddress();
    const [sender] = await ethers.getSigners();

    await expect(
      sender.sendTransaction({
        to: upAddr,
        value: ethers.parseEther("1")
      })
    )
      .to.emit(mockRegistry, "Refined")
      .withArgs(pixId, 2);
  });

  it("subscribe BurntPix with only LYX type, send LSP7 => no refine triggered", async () => {
    await subscribeBurntPixFor([LSP0_VALUE_RECEIVED]);
    const pixId = "0x1234000000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(mockRegistry.target, pixId, 3);

    const upAddr = await universalProfile.getAddress();
    await mockLSP7.connect(LSP7Holder).mint(LSP7Holder, 10);

    await expect(
      mockLSP7.connect(LSP7Holder).transfer(
        await LSP7Holder.getAddress(),
        upAddr,
        10,
        true,
        "0x"
      )
    ).to.not.emit(mockRegistry, "Refined");
  });

  it("subscribe BurntPix with only LSP7 type, send LSP7 => refine triggered", async () => {
    await subscribeBurntPixFor([LSP7_TYPEID]);
    const pixId = "0xabcd000000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(mockRegistry.target, pixId, 2);

    const upAddr = await universalProfile.getAddress();
    await mockLSP7.connect(LSP7Holder).mint(LSP7Holder, 7);

    await expect(
      mockLSP7.connect(LSP7Holder).transfer(
        await LSP7Holder.getAddress(),
        upAddr,
        7,
        true,
        "0x"
      )
    )
      .to.emit(mockRegistry, "Refined")
      .withArgs(pixId, 2);
  });

  it("subscribe BurntPix with only LSP7 type, send LSP8 => no refine triggered", async () => {
    await subscribeBurntPixFor([LSP7_TYPEID]);
    await setBurntPixConfig(
      mockRegistry.target,
      "0xbeef000000000000000000000000000000000000000000000000000000000000",
      5
    );

    const upAddr = await universalProfile.getAddress();
    const tokenId = ethers.toBeHex(1, 32);
    await mockLSP8.connect(LSP8Holder).mint(LSP8Holder, tokenId);

    await expect(
      mockLSP8.connect(LSP8Holder).transfer(
        await LSP8Holder.getAddress(),
        upAddr,
        tokenId,
        true,
        "0x"
      )
    ).to.not.emit(mockRegistry, "Refined");
  });

  it("subscribe BurntPix with only LSP7 type, send LYX => no refine triggered", async () => {
    await subscribeBurntPixFor([LSP7_TYPEID]);
    await setBurntPixConfig(
      mockRegistry.target,
      "0x9999000000000000000000000000000000000000000000000000000000000000",
      1
    );

    const upAddr = await universalProfile.getAddress();
    const [sender] = await ethers.getSigners();

    await expect(
      sender.sendTransaction({
        to: upAddr,
        value: ethers.parseEther("1")
      })
    ).to.not.emit(mockRegistry, "Refined");
  });

  it("subscribe BurntPix with only LSP8 type, send LSP8 => refine triggered", async () => {
    await subscribeBurntPixFor([LSP8_TYPEID]);
    const pixId = "0xaaaa000000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(mockRegistry.target, pixId, 9);

    const upAddr = await universalProfile.getAddress();
    const tokenId = ethers.toBeHex(101, 32);
    await mockLSP8.connect(LSP8Holder).mint(LSP8Holder, tokenId);

    await expect(
      mockLSP8.connect(LSP8Holder).transfer(
        await LSP8Holder.getAddress(),
        upAddr,
        tokenId,
        true,
        "0x"
      )
    )
      .to.emit(mockRegistry, "Refined")
      .withArgs(pixId, 9);
  });

  it("subscribe BurntPix with only LSP8 type, send LSP7 => no refine triggered", async () => {
    await subscribeBurntPixFor([LSP8_TYPEID]);
    await setBurntPixConfig(
      mockRegistry.target,
      "0xbbbb000000000000000000000000000000000000000000000000000000000000",
      2
    );

    const upAddr = await universalProfile.getAddress();
    await mockLSP7.connect(LSP7Holder).mint(LSP7Holder, 12);

    await expect(
      mockLSP7.connect(LSP7Holder).transfer(
        await LSP7Holder.getAddress(),
        upAddr,
        12,
        true,
        "0x"
      )
    ).to.not.emit(mockRegistry, "Refined");
  });

  it("subscribe BurntPix with only LSP8 type, send LYX => no refine triggered", async () => {
    await subscribeBurntPixFor([LSP8_TYPEID]);
    await setBurntPixConfig(
      mockRegistry.target,
      "0xcccc000000000000000000000000000000000000000000000000000000000000",
      7
    );

    const upAddr = await universalProfile.getAddress();
    const [sender] = await ethers.getSigners();

    await expect(
      sender.sendTransaction({ to: upAddr, value: ethers.parseEther("1") })
    ).to.not.emit(mockRegistry, "Refined");
  });

  it("subscribe BurntPix for LYX, LSP7, LSP8 => send LYX => refine triggered", async () => {
    await subscribeBurntPixFor([LSP0_VALUE_RECEIVED, LSP7_TYPEID, LSP8_TYPEID]);
    const pixId = "0xdddd000000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(mockRegistry.target, pixId, 10);

    const upAddr = await universalProfile.getAddress();
    const [sender] = await ethers.getSigners();

    await expect(
      sender.sendTransaction({ to: upAddr, value: ethers.parseEther("1") })
    )
      .to.emit(mockRegistry, "Refined")
      .withArgs(pixId, 10);
  });

  it("subscribe BurntPix for LYX, LSP7, LSP8 => send LSP7 => refine triggered", async () => {
    await subscribeBurntPixFor([LSP0_VALUE_RECEIVED, LSP7_TYPEID, LSP8_TYPEID]);
    const pixId = "0xab01000000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(mockRegistry.target, pixId, 3);

    const upAddr = await universalProfile.getAddress();
    await mockLSP7.connect(LSP7Holder).mint(LSP7Holder, 50);

    await expect(
      mockLSP7.connect(LSP7Holder).transfer(
        await LSP7Holder.getAddress(),
        upAddr,
        50,
        true,
        "0x"
      )
    )
      .to.emit(mockRegistry, "Refined")
      .withArgs(pixId, 3);
  });

  it("subscribe BurntPix for LYX, LSP7, LSP8 => send LSP8 => refine triggered", async () => {
    await subscribeBurntPixFor([LSP0_VALUE_RECEIVED, LSP7_TYPEID, LSP8_TYPEID]);
    const pixId = "0xffee000000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(mockRegistry.target, pixId, 11);

    const upAddr = await universalProfile.getAddress();
    const tokenId = ethers.toBeHex(202, 32);
    await mockLSP8.connect(LSP8Holder).mint(LSP8Holder, tokenId);

    await expect(
      mockLSP8.connect(LSP8Holder).transfer(
        await LSP8Holder.getAddress(),
        upAddr,
        tokenId,
        true,
        "0x"
      )
    )
      .to.emit(mockRegistry, "Refined")
      .withArgs(pixId, 11);
  });

  it("subscribe TipAssistant + BurntPix (for LYX), send LYX => both triggered", async () => {
    await subscribeBurntPixFor([LSP0_VALUE_RECEIVED]);
    const pixId = "0x9998880000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(mockRegistry.target, pixId, 1);

    // Subscribe Tip
    await subscribeTipForLYX(10, await owner.getAddress());

    // Combine them for LYX
    const upAddr = await universalProfile.getAddress();
    const burntPixAddr = await burntPixAssistant.getAddress();
    const tipAddr = await tipAssistant.getAddress();

    const lsp0Key = generateMappingKey("UAPTypeConfig", LSP0_VALUE_RECEIVED);
    const combined = customEncodeAddresses([burntPixAddr, tipAddr]);
    await universalProfile.setData(lsp0Key, combined);

    const [sender] = await ethers.getSigners();
    const tx = sender.sendTransaction({ to: upAddr, value: ethers.parseEther("1") });

    await expect(tx)
      .to.emit(mockRegistry, "Refined")
      .withArgs(pixId, 1);

    await expect(tx)
      .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
      .withArgs(upAddr, burntPixAddr);

    await expect(tx)
      .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
      .withArgs(upAddr, tipAddr);
  });

  it("subscribe Tip + BurntPix (LYX + LSP7), send LSP7 => only BurntPix triggered", async () => {
    await subscribeTipForLYX(10, await owner.getAddress());
    await subscribeBurntPixFor([LSP7_TYPEID]);
    const pixId = "0x123fff0000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(mockRegistry.target, pixId, 2);

    const upAddr = await universalProfile.getAddress();
    const tipAddr = await tipAssistant.getAddress();
    const pixAddr = await burntPixAssistant.getAddress();

    // Ensure LSP7 includes only BurntPix
    const lsp7Key = generateMappingKey("UAPTypeConfig", LSP7_TYPEID);
    const combined = customEncodeAddresses([pixAddr]);
    await universalProfile.setData(lsp7Key, combined);

    await mockLSP7.connect(LSP7Holder).mint(LSP7Holder, 77);
    const tx = mockLSP7.connect(LSP7Holder).transfer(
      await LSP7Holder.getAddress(),
      upAddr,
      77,
      true,
      "0x"
    );

    // Positive: refine triggered
    await expect(tx)
      .to.emit(mockRegistry, "Refined")
      .withArgs(pixId, 2);

    // Positive: BurntPix invoked
    await expect(tx)
      .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
      .withArgs(upAddr, pixAddr);


      const txReceipt = await (await tx).wait();
      const assistantInvokedLogs = [];
      
      // Parse each log to see if it matches "AssistantInvoked" from universalReceiverDelegateUAP
      for (const log of txReceipt.logs) {
        // Skip if not from your delegate contract's address
        if (log.address.toLowerCase() !== universalReceiverDelegateUAP.target.toLowerCase()) continue;
      
        try {
          const parsedLog = universalReceiverDelegateUAP.interface.parseLog(log);
          if (parsedLog.name === "AssistantInvoked") {
            assistantInvokedLogs.push(parsedLog);
          }
        } catch (err) {
          // parseLog throws if the log isn't recognized by this interface
        }
      }
      
      // Now `assistantInvokedLogs` is an array of parsed "AssistantInvoked" logs
      expect(assistantInvokedLogs.length).to.equal(1);
  });

  it("subscribe Tip + BurntPix (LYX + LSP8), send LSP8 => only BurntPix triggered", async () => {
    await subscribeTipForLYX(15, await owner.getAddress());
    await subscribeBurntPixFor([LSP8_TYPEID]);

    const pixId = "0x8889990000000000000000000000000000000000000000000000000000000000";
    await setBurntPixConfig(mockRegistry.target, pixId, 5);

    const upAddr = await universalProfile.getAddress();
    const tipAddr = await tipAssistant.getAddress();
    const pixAddr = await burntPixAssistant.getAddress();

    const lsp8Key = generateMappingKey("UAPTypeConfig", LSP8_TYPEID);
    const combined = customEncodeAddresses([pixAddr]);
    await universalProfile.setData(lsp8Key, combined);

    const tokenId = ethers.toBeHex(55, 32);
    await mockLSP8.connect(LSP8Holder).mint(LSP8Holder, tokenId);

    const tx = mockLSP8.connect(LSP8Holder).transfer(
      await LSP8Holder.getAddress(),
      upAddr,
      tokenId,
      true,
      "0x"
    );

    await expect(tx)
      .to.emit(mockRegistry, "Refined")
      .withArgs(pixId, 5);

    await expect(tx)
      .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
      .withArgs(upAddr, pixAddr);

    const txReceipt = await (await tx).wait();
    const assistantInvokedLogs = [];
    
    // Parse each log to see if it matches "AssistantInvoked" from universalReceiverDelegateUAP
    for (const log of txReceipt.logs) {
      // Skip if not from your delegate contract's address
      if (log.address.toLowerCase() !== universalReceiverDelegateUAP.target.toLowerCase()) continue;
    
      try {
        const parsedLog = universalReceiverDelegateUAP.interface.parseLog(log);
        if (parsedLog.name === "AssistantInvoked") {
          assistantInvokedLogs.push(parsedLog);
        }
      } catch (err) {
        // parseLog throws if the log isn't recognized by this interface
      }
    }
    
    // Now `assistantInvokedLogs` is an array of parsed "AssistantInvoked" logs
    expect(assistantInvokedLogs.length).to.equal(1);
  });
  it("should mint LSP7 tokens via UP and trigger BurntPixRefinerAssistant for LSP7", async function () {
    // Subscribe the UP to BurntPixRefinerAssistant for LSP7 events.
    const typeMappingKey = generateMappingKey("UAPTypeConfig", LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification);
    const encodedAssistantsData = customEncodeAddresses([await burntPixAssistant.getAddress()]);
    await universalProfile.setData(typeMappingKey, encodedAssistantsData);
  
    // Set up the BurntPix configuration for the assistant.
    // Here we encode the registry address, the pixId, and the number of iterations.
    const execKey = generateMappingKey("UAPExecutiveConfig", await burntPixAssistant.getAddress());
    const pixId = "0x1234000000000000000000000000000000000000000000000000000000000000";
    const iters = 2;
    const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "bytes32", "uint256"],
      [mockRegistry.target, pixId, iters]
    );
    await universalProfile.setData(execKey, encodedConfig);
    const upAddr = await universalProfile.getAddress();

    // Mint LSP7 tokens by having the UP execute the mint call.
    const mintPayload = mockLSP7.interface.encodeFunctionData("mint", [
      upAddr, // UP receives the minted tokens
      1              // Mint 1 token
    ]);
    
    // Expect that the refine() call is triggered on the registry (event "Refined")
    await expect(
      universalProfile.connect(owner).execute(
        0,                          // operationType: CALL
        await mockLSP7.getAddress(), // target: LSP7 contract address
        0,                          // value: 0 ETH
        mintPayload                 // data: encoded mint call
      )
    ).to.emit(mockRegistry, "Refined").withArgs(pixId, iters);
  });

  it("should mint LSP8 tokens via UP and trigger BurntPixRefinerAssistant for LSP8", async function () {
    // Subscribe the UP to BurntPixRefinerAssistant for LSP8 events.
    const typeMappingKey = generateMappingKey("UAPTypeConfig", LSP1_TYPE_IDS.LSP8Tokens_RecipientNotification);
    const encodedAssistantsData = customEncodeAddresses([await burntPixAssistant.getAddress()]);
    await universalProfile.setData(typeMappingKey, encodedAssistantsData);
  
    // Set up the BurntPix configuration for the assistant.
    const execKey = generateMappingKey("UAPExecutiveConfig", await burntPixAssistant.getAddress());
    const pixId = "0xabcdef0000000000000000000000000000000000000000000000000000000000";
    const iters = 3;
    const encodedConfig = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "bytes32", "uint256"],
      [mockRegistry.target, pixId, iters]
    );
    await universalProfile.setData(execKey, encodedConfig);
    const upAddr = await universalProfile.getAddress();

    // For LSP8 tokens, we need to mint with a tokenId.
    const tokenId = ethers.toBeHex(1, 32);
    const mintPayload = mockLSP8.interface.encodeFunctionData("mint", [
      upAddr, // UP receives the minted token
      tokenId      // The tokenId for the LSP8 asset
    ]);
    
    // Expect that the refine() call is triggered on the registry (event "Refined")
    await expect(
      universalProfile.connect(owner).execute(
        0,                          // operationType: CALL
        await mockLSP8.getAddress(), // target: LSP8 contract address
        0,                          // value: 0 ETH
        mintPayload                 // data: encoded mint call
      )
    ).to.emit(mockRegistry, "Refined").withArgs(pixId, iters);
  });
  
  
});
