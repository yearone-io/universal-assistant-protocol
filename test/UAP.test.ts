import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { LSP1_TYPE_IDS } from "@lukso/lsp-smart-contracts";

// Import the artifacts (assumed to be compiled and available)
import { UniversalReceiverDelegateUAP, MockLSP0, MockAssistant, MockBadAssistant, MockTrueScreenerAssistant, MockFalseScreenerAssistant, MockBadScreenerAssistant, MockERC725Y } from "../typechain-types";

describe("UniversalReceiverDelegateUAP", function () {
  let owner: Signer;
  let nonOwner: Signer;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let universalReceiverDelegateUAPAddress: string;
  let mockLSP0: MockLSP0;
  let mockAssistant: MockAssistant;
  let mockAssistantAddress: string;
  let mockBadAssistant: MockAssistant;
  let mockBadAssistantAddress: string;
  let mockTrueScreenerAssistant: MockTrueScreenerAssistant;
  let mockTrueScreenerAssistantAddress: string;
  let mockFalseScreenerAssistant: MockTrueScreenerAssistant;
  let mockFalseScreenerAssistantAddress: string;
  let mockBadScreenerAssistant: MockTrueScreenerAssistant;
  let mockBadScreenerAssistantAddress: string;
  let mockERC725Y: MockERC725Y;
  let typeMappingKey: string;
  let nonStandardTypeMappingKey: string;

  beforeEach(async function () {
    [owner, nonOwner] = await ethers.getSigners();

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

    const MockBadAssistantFactory = await ethers.getContractFactory("MockBadAssistant");
    mockBadAssistant = (await MockBadAssistantFactory.deploy()) as MockBadAssistant;
    mockBadAssistantAddress = await mockBadAssistant.getAddress();

    const MockTrueScreenerAssistantFactory = await ethers.getContractFactory("MockTrueScreenerAssistant");
    mockTrueScreenerAssistant = (await MockTrueScreenerAssistantFactory.deploy()) as MockTrueScreenerAssistant;
    mockTrueScreenerAssistantAddress = await mockTrueScreenerAssistant.getAddress();

    const MockFalseScreenerAssistantFactory = await ethers.getContractFactory("MockFalseScreenerAssistant");
    mockFalseScreenerAssistant = (await MockFalseScreenerAssistantFactory.deploy()) as MockFalseScreenerAssistant;
    mockFalseScreenerAssistantAddress = await mockFalseScreenerAssistant.getAddress();

    const MockBadScreenerAssistantFactory = await ethers.getContractFactory("MockBadScreenerAssistant");
    mockBadScreenerAssistant = (await MockBadScreenerAssistantFactory.deploy()) as MockBadScreenerAssistant;
    mockBadScreenerAssistantAddress = await mockBadScreenerAssistant.getAddress();

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

    it("should invoke executive assistants when they are found", async function () {
      // Encode the assistant addresses
      const encodedData = customEncodeAddresses([mockAssistantAddress]);

      // Mock getData to return the encoded addresses
      await mockERC725Y.setData(nonStandardTypeMappingKey, encodedData);

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

    it("should invoke executive assistants after evaluating true screener assistant", async function () {
      const encodedAssistantsData = customEncodeAddresses([mockAssistantAddress]);
      await mockERC725Y.setData(nonStandardTypeMappingKey, encodedAssistantsData);
      // encoded executive assistant screener
      const assistantScreenerKey = generateMappingKey('UAPExecutiveScreeners', mockAssistantAddress);
      const encodedScreenersData = customEncodeAddresses([mockTrueScreenerAssistantAddress]);
      await mockERC725Y.setData(assistantScreenerKey, encodedScreenersData); 

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

    it("should not invoke executive assistants after evaluating false screener assistant", async function () {
      const encodedAssistantsData = customEncodeAddresses([mockAssistantAddress]);
      await mockERC725Y.setData(nonStandardTypeMappingKey, encodedAssistantsData);
      // encoded executive assistant screener
      const assistantScreenerKey = generateMappingKey('UAPExecutiveScreeners', mockAssistantAddress);
      const encodedScreenersData = customEncodeAddresses([mockFalseScreenerAssistantAddress]);
      await mockERC725Y.setData(assistantScreenerKey, encodedScreenersData); 

      await expect(
        mockLSP0.callUniversalReceiverDelegate(
          universalReceiverDelegateUAPAddress,
          await owner.getAddress(),
          0,
          LSP1_TYPE_IDS.LSP0ValueReceived,
          "0x"
        )
      )
        .to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
    });

    it("should handle screener delegatecall failures through revert", async function () {
      const encodedAssistantsData = customEncodeAddresses([mockAssistantAddress]);
      await mockERC725Y.setData(nonStandardTypeMappingKey, encodedAssistantsData);
      // encoded executive assistant screener
      const assistantScreenerKey = generateMappingKey('UAPExecutiveScreeners', mockAssistantAddress);
      const encodedScreenersData = customEncodeAddresses([mockBadScreenerAssistantAddress]);
      await mockERC725Y.setData(assistantScreenerKey, encodedScreenersData); 

      await expect(
        mockLSP0.callUniversalReceiverDelegate(
          universalReceiverDelegateUAPAddress,
          await owner.getAddress(),
          0,
          LSP1_TYPE_IDS.LSP0ValueReceived,
          "0x"
        )
      ).to.be.revertedWith("UniversalReceiverDelegateUAP: Screener evaluation failed");
    });

    it("should handle executive delegatecall failures through revert", async function () {
      const encodedAssistantsData = customEncodeAddresses([mockBadAssistantAddress]);
      await mockERC725Y.setData(nonStandardTypeMappingKey, encodedAssistantsData);
      // encoded executive assistant screener
      const assistantScreenerKey = generateMappingKey('UAPExecutiveScreeners', mockAssistantAddress);
      const encodedScreenersData = customEncodeAddresses([mockTrueScreenerAssistantAddress]);
      await mockERC725Y.setData(assistantScreenerKey, encodedScreenersData); 

      await expect(
        mockLSP0.callUniversalReceiverDelegate(
          universalReceiverDelegateUAPAddress,
          await owner.getAddress(),
          0,
          LSP1_TYPE_IDS.LSP0ValueReceived,
          "0x"
        )
      ).to.be.revertedWith("UniversalReceiverDelegateUAP: Assistant execution failed");
    });

    it("should correctly decode addresses in customDecodeAddresses function", async function () {
      const addresses = [await owner.getAddress(), await nonOwner.getAddress()];
      const encodedData = customEncodeAddresses(addresses);
      const decodedAddresses = await universalReceiverDelegateUAP.customDecodeAddresses(
        encodedData
      );

      expect(decodedAddresses[0]).to.equal(addresses[0]);
      expect(decodedAddresses[1]).to.equal(addresses[1]);
    });

    it.skip("should revert if a screener assistant is not trusted", async function () {
    });

    it.skip("should revert if an executive assistant is not trusted", async function () {
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
