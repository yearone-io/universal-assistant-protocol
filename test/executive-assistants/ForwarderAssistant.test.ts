import { ethers } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";
import { LSP1_TYPE_IDS } from "@lukso/lsp-smart-contracts";
import {
  ForwarderAssistant,
  MockAssistant,
  MockBadAssistant,
} from "../../typechain-types";
import { customEncodeAddresses, deployUniversalProfile, deployMockAssets, generateMappingKey } from "../utils/TestUtils";

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

  beforeEach(async function () {
    [owner, browserController, nonOwner, nonOwner2, lsp7Holder, lsp8Holder] = await ethers.getSigners();
    ({ universalProfile, universalReceiverDelegateUAP } = await deployUniversalProfile(owner, browserController));
    ({ lsp7: mockLSP7, lsp8: mockLSP8 } = await deployMockAssets(lsp7Holder));

    const MockAssistantFactory = await ethers.getContractFactory("MockAssistant");
    mockAssistant = await MockAssistantFactory.deploy();
    const MockBadAssistantFactory = await ethers.getContractFactory("MockBadAssistant");
    mockBadAssistant = await MockBadAssistantFactory.deploy();
    const ForwarderAssistantFactory = await ethers.getContractFactory("ForwarderAssistant");
    firstForwarderAssistant = await ForwarderAssistantFactory.deploy();
    secondForwarderAssistant = await ForwarderAssistantFactory.deploy();
  });

  describe("Edge Cases", function () {
    it("Two Forwarders configured with different destination addresses should only trigger first Forwarder", async function () {
      const typeMappingKey = generateMappingKey("UAPTypeConfig", LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification);
      await universalProfile.setData(typeMappingKey,
        customEncodeAddresses([
            firstForwarderAssistant.target,
            secondForwarderAssistant.target
        ])
      );
      const firstForwarderInstructionsKey = generateMappingKey("UAPExecutiveConfig", firstForwarderAssistant.target);
      const secondForwarderInstructionsKey = generateMappingKey("UAPExecutiveConfig", secondForwarderAssistant.target);
      const firstTargetAddress = await nonOwner.getAddress();
      const secondTargetAddress = await nonOwner2.getAddress();
      const firstEncodedInstructions = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [firstTargetAddress]);
      const secondEncodedInstructions = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [secondTargetAddress]);
      await universalProfile.setData(firstForwarderInstructionsKey, firstEncodedInstructions);
      await universalProfile.setData(secondForwarderInstructionsKey, secondEncodedInstructions);

      expect(await mockLSP7.connect(lsp7Holder).mint(universalProfile.target, 1)).to.emit(universalReceiverDelegateUAP, "AssistantNoOp").withArgs(universalProfile.target, secondForwarderAssistant.target);
      expect(await mockLSP7.balanceOf(firstTargetAddress)).to.equal(1);
      expect(await mockLSP7.balanceOf(secondTargetAddress)).to.equal(0);
      
    });
  });
});