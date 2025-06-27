import { ethers } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";
import { LSP1_TYPE_IDS } from "@lukso/lsp-smart-contracts";
import {
  ForwarderAssistant,
  MockAssistant,
  MockBadAssistant,
} from "../../typechain-types";
import { deployUniversalProfile, deployMockAssets } from "../utils/TestUtils";
import ERC725, { ERC725JSONSchema } from "@erc725/erc725.js";
import uap from '../../schemas/UAP.json';
import { encodeTupleKeyValue } from "@erc725/erc725.js/build/main/src/lib/utils";

describe("Executives: Forwarder", function () {
  let owner: Signer;
  let browserController: Signer;
  let nonOwner: Signer;
  let nonOwner2: Signer;
  let lsp7Holder: Signer;
  let lsp8Holder: Signer;
  let universalProfile: any;
  let universalReceiverDelegateUAP: any;
  let mockAssistant: MockAssistant;
  let mockBadAssistant: MockBadAssistant;
  let firstForwarderAssistant: ForwarderAssistant;
  let secondForwarderAssistant: ForwarderAssistant;
  let mockLSP7: any;
  let mockLSP8: any;
  let erc725UAP: ERC725;

  beforeEach(async function () {
    [owner, browserController, nonOwner, nonOwner2, lsp7Holder, lsp8Holder] = await ethers.getSigners();
    ({ universalProfile, universalReceiverDelegateUAP } = await deployUniversalProfile(owner, browserController));
    ({ lsp7: mockLSP7, lsp8: mockLSP8 } = await deployMockAssets(lsp7Holder));
    erc725UAP = new ERC725(uap as ERC725JSONSchema[], universalProfile.target, ethers.provider);

    const MockAssistantFactory = await ethers.getContractFactory("MockAssistant");
    mockAssistant = await MockAssistantFactory.deploy();
    await mockAssistant.waitForDeployment();
    const MockBadAssistantFactory = await ethers.getContractFactory("MockBadAssistant");
    mockBadAssistant = await MockBadAssistantFactory.deploy();
    await mockBadAssistant.waitForDeployment();
    const ForwarderAssistantFactory = await ethers.getContractFactory("ForwarderAssistant");
    firstForwarderAssistant = await ForwarderAssistantFactory.deploy();
    await firstForwarderAssistant.waitForDeployment();
    secondForwarderAssistant = await ForwarderAssistantFactory.deploy();
    await secondForwarderAssistant.waitForDeployment();
  });

  describe("Edge Cases", function () {
    it("Two Forwarders configured with different destination addresses should only trigger first Forwarder", async function () {
      // set executives for type
      const typeMappingKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification]);
      await universalProfile.setData(typeMappingKey,
        erc725UAP.encodeValueType("address[]", [
            firstForwarderAssistant.target,
            secondForwarderAssistant.target
        ])
      );
      const firstForwarderInstructionsKey = erc725UAP.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification, "0"]);
      const secondForwarderInstructionsKey = erc725UAP.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification, "1"]);
      const firstTargetAddress = await nonOwner.getAddress();
      const secondTargetAddress = await nonOwner2.getAddress();
      const firstEncodedInstructions = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [firstTargetAddress]);
      const secondEncodedInstructions = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [secondTargetAddress]);
      await universalProfile.setData(firstForwarderInstructionsKey,
        encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [firstForwarderAssistant.target, firstEncodedInstructions]));
      await universalProfile.setData(secondForwarderInstructionsKey,
        encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [secondForwarderAssistant.target, secondEncodedInstructions]));

      expect(await mockLSP7.connect(lsp7Holder).mint(universalProfile.target, 1)).to.emit(universalReceiverDelegateUAP, "AssistantNoOp").withArgs(universalProfile.target, secondForwarderAssistant.target);
      expect(await mockLSP7.balanceOf(firstTargetAddress)).to.equal(1);
      expect(await mockLSP7.balanceOf(secondTargetAddress)).to.equal(0);
      
    });

    it("LSP8 ForwarderAssistant should only forward tokens when UP owns them", async function () {
      // Setup ForwarderAssistant for LSP8 tokens
      const typeMappingKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP8Tokens_RecipientNotification]);
      await universalProfile.setData(typeMappingKey,
        erc725UAP.encodeValueType("address[]", [await firstForwarderAssistant.getAddress()])
      );
      
      const forwarderInstructionsKey = erc725UAP.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [LSP1_TYPE_IDS.LSP8Tokens_RecipientNotification, "0"]);
      const targetAddress = await nonOwner.getAddress();
      const encodedInstructions = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [targetAddress]);
      await universalProfile.setData(forwarderInstructionsKey,
        encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [await firstForwarderAssistant.getAddress(), encodedInstructions]));

      // Case 1: Mint token to UP (UP owns it) - should forward
      const tokenId1 = ethers.solidityPackedKeccak256(["string"], ["token1"]);
      await expect(mockLSP8.connect(lsp8Holder).mint(await universalProfile.getAddress(), tokenId1))
        .to.emit(firstForwarderAssistant, "LSP8AssetForwarded")
        .withArgs(await mockLSP8.getAddress(), tokenId1, targetAddress);
      
      // Verify token was forwarded
      expect(await mockLSP8.tokenOwnerOf(tokenId1)).to.equal(targetAddress);

      // Case 2: Transfer a token to UP that UP already owns - should forward again
      const tokenId2 = ethers.solidityPackedKeccak256(["string"], ["token2"]);
      await mockLSP8.connect(lsp8Holder).mint(await lsp8Holder.getAddress(), tokenId2);
      
      // Verify token is owned by lsp8Holder, not UP
      expect(await mockLSP8.tokenOwnerOf(tokenId2)).to.equal(await lsp8Holder.getAddress());
      
      // Transfer to UP - this should forward since UP will own it during execution
      await expect(mockLSP8.connect(lsp8Holder).transfer(await lsp8Holder.getAddress(), await universalProfile.getAddress(), tokenId2, false, "0x"))
        .to.emit(firstForwarderAssistant, "LSP8AssetForwarded")
        .withArgs(await mockLSP8.getAddress(), tokenId2, targetAddress);
      
      // Verify the token was forwarded to target
      expect(await mockLSP8.tokenOwnerOf(tokenId2)).to.equal(targetAddress);
    });

    it("ForwarderAssistant should emit standardized ExecutionResult events", async function () {
      // Setup ForwarderAssistant for LSP7 tokens
      const typeMappingKey = erc725UAP.encodeKeyName("UAPTypeConfig:<bytes32>", [LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification]);
      await universalProfile.setData(typeMappingKey,
        erc725UAP.encodeValueType("address[]", [await firstForwarderAssistant.getAddress()])
      );
      
      const forwarderInstructionsKey = erc725UAP.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification, "0"]);
      const targetAddress = await nonOwner.getAddress();
      const encodedInstructions = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [targetAddress]);
      await universalProfile.setData(forwarderInstructionsKey,
        encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [await firstForwarderAssistant.getAddress(), encodedInstructions]));

      // Mint LSP7 token and verify standardized events are emitted
      await expect(mockLSP7.connect(lsp7Holder).mint(await universalProfile.getAddress(), 100))
        .to.emit(universalReceiverDelegateUAP, "ExecutionResult")
        .withArgs(LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification, await universalProfile.getAddress(), await firstForwarderAssistant.getAddress(), true);
    });
  });
});