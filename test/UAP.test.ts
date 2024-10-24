import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { LSP1_TYPE_IDS } from "@lukso/lsp-smart-contracts";

// Import the artifacts (assumed to be compiled and available)
import { UniversalReceiverDelegateUAP } from "../typechain-types";
import { MockLSP0 } from "../typechain-types";
import { MockAssistant } from "../typechain-types";
import { MockScreenerAssistant } from "../typechain-types";
import { MockERC725Y } from "../typechain-types";

describe("UniversalReceiverDelegateUAP", function () {
  let owner: Signer;
  let nonOwner: Signer;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let universalReceiverDelegateUAPAddress: string;
  let mockLSP0: MockLSP0;
  let mockAssistant: MockAssistant;
  let mockAssistantAddress: string;
  let mockScreenerAssistant: MockScreenerAssistant;
  let mockScreenerAssistantAddress: string;
  let mockERC725Y: MockERC725Y;
  let typeMappingKey: string;
  let nonStandardTypeMappingKey: string;

  beforeEach(async function () {
    [owner, nonOwner] = await ethers.getSigners();
    console.log("owner", await owner.getAddress());

    // Deploy UniversalReceiverDelegateUAP
    const UniversalReceiverDelegateUAPFactory = await ethers.getContractFactory(
      "UniversalReceiverDelegateUAP"
    );
    universalReceiverDelegateUAP = (await UniversalReceiverDelegateUAPFactory.deploy()) as UniversalReceiverDelegateUAP;
    await universalReceiverDelegateUAP.waitForDeployment();
    universalReceiverDelegateUAPAddress = await universalReceiverDelegateUAP.getAddress();

    // Deploy mock LSP0
    const MockLSP0Factory = await ethers.getContractFactory("MockLSP0");
    mockLSP0 = (await MockLSP0Factory.deploy()) as MockLSP0;
    await mockLSP0.waitForDeployment();
    const mockLSP0Address = await mockLSP0.getAddress();
    console.log("mockLSP0Address", mockLSP0Address);

    // Deploy mock ERC725Y (storage)
    const MockERC725YFactory = await ethers.getContractFactory("MockERC725Y");
    mockERC725Y = (await MockERC725YFactory.deploy()) as MockERC725Y;
    await mockERC725Y.waitForDeployment();
    const mockERC725YAddress = await mockERC725Y.getAddress();

    // Set the ERC725Y instance in the mock LSP0 contract
    await mockLSP0.setERC725Y(mockERC725YAddress);

    // Deploy mock assistant contracts
    const MockAssistantFactory = await ethers.getContractFactory("MockAssistant");
    mockAssistant = (await MockAssistantFactory.deploy()) as MockAssistant;
    mockAssistantAddress = await mockAssistant.getAddress();
    console.log("mockAssistantAddress", mockAssistantAddress);

    const MockScreenerAssistantFactory = await ethers.getContractFactory("MockScreenerAssistant");
    mockScreenerAssistant = (await MockScreenerAssistantFactory.deploy()) as MockScreenerAssistant;
    mockScreenerAssistantAddress = await mockScreenerAssistant.getAddress();

    typeMappingKey = generateMappingKey('UAPTypeConfig', LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification);
    nonStandardTypeMappingKey = generateMappingKey('UAPTypeConfig', LSP1_TYPE_IDS.LSP0ValueReceived);
  });

  describe("universalReceiverDelegate", function () {
    it("should revert if caller is not an LSP0", async function () {
      await expect(
        universalReceiverDelegateUAP
          .connect(nonOwner)
          .universalReceiverDelegate(
            await owner.getAddress(),
            0,
            LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification,
            "0x"
          )
      ).to.be.revertedWith("UniversalReceiverDelegateUAP: Caller is not an LSP0");
    });

    it("should proceed with super function if no type configuration is found", async function () {
      await expect(
        mockLSP0.connect(nonOwner).callUniversalReceiverDelegate(
          universalReceiverDelegateUAPAddress,
          await owner.getAddress(),
          0,
          LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification,
          "0x"
        )
      ).to.not.be.reverted;
    });

    it("should proceed with super function if type configuration is found but no assistants are found", async function () {
      // Mock getData to return data that decodes to an empty array
      const encodedData = customEncodeAddresses([]);
      console.log("encodedData", encodedData);
      await mockERC725Y.setData(typeMappingKey, encodedData);

      await expect(
        mockLSP0.callUniversalReceiverDelegate(
          universalReceiverDelegateUAPAddress,
          await owner.getAddress(),
          0,
          LSP1_TYPE_IDS.LSP0ValueReceived, // for lsp7,8 need to pass accurate data otherwise tx will revert
          "0x"
        )
      ).to.not.be.reverted;
    });

    it.only("should invoke executive assistants when they are found", async function () {
      // Encode the assistant addresses
      const encodedData = customEncodeAddresses([mockAssistantAddress]);

      // Mock getData to return the encoded addresses
      await mockERC725Y.setData(nonStandardTypeMappingKey, encodedData);
      console.log("UAP.test custom encoded addresses:", encodedData)

      // Mock the assistant's execute function
      //const abi = ethers.AbiCoder.defaultAbiCoder();
      //const mockReturn = abi.encode(["uint256", "bytes"], [0, "0x"]);
      /*
      const selectorFromMock = await mockAssistant.getExecuteSelector();
      const selectorFromInterface = IExecutiveAssistant.interface.getSighash('execute');
      expect(selectorFromMock).to.equal(selectorFromInterface);
      */

      await expect(
        mockLSP0.callUniversalReceiverDelegate(
          universalReceiverDelegateUAPAddress,
          await owner.getAddress(),
          0,
          LSP1_TYPE_IDS.LSP0ValueReceived,
          "0x"
        )
      )
        .to.emit(universalReceiverDelegateUAP, "AssistantFound")
        .withArgs(mockAssistantAddress);
      await expect(
        mockLSP0.callUniversalReceiverDelegate(
          universalReceiverDelegateUAPAddress,
          await owner.getAddress(),
          0,
          LSP1_TYPE_IDS.LSP0ValueReceived,
          "0x"
        )
      )
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(mockAssistantAddress);
    });
  });
});

export const generateMappingKey = (keyName: string, typeId: string): string => {
  const hashedKey = ethers.keccak256(ethers.toUtf8Bytes(keyName));
  const first10Bytes = hashedKey.slice(2, 22);
  const last20Bytes = typeId.slice(2, 42);
  return '0x' + first10Bytes + '0000' + last20Bytes;
};

export function customEncodeAddresses(addresses: string[]): string {
  if (addresses.length > 65535) {
    throw new Error("Number of addresses exceeds uint16 capacity.");
  }

  // Use ethers v6 `solidityPacked` to encode the length and addresses
  const encoded = ethers.solidityPacked(
    ["uint16", ...Array(addresses.length).fill("address")],
    [addresses.length, ...addresses]
  );

  return encoded;
}
