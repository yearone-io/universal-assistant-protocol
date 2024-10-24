import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, Signer } from "ethers";
import { LSP1_TYPE_IDS } from "@lukso/lsp-smart-contracts";

// Import the artifacts (assumed to be compiled and available)
import { UniversalReceiverDelegateUAP } from "../typechain-types";
import { MockLSP0 } from "../typechain-types";
import { MockAssistant } from "../typechain-types";
import { MockScreenerAssistant } from "../typechain-types";
import { MockERC725Y } from "../typechain-types";

describe.skip("UniversalReceiverDelegateUAP", function () {
  let owner: Signer;
  let nonOwner: Signer;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let universalReceiverDelegateUAPAddress: string;
  let mockLSP0: MockLSP0;
  let mockAssistant: MockAssistant;
  let mockScreenerAssistant: MockScreenerAssistant;
  let mockERC725Y: MockERC725Y;

  const INTERFACEID_LSP0 = "0x3c54a2a1"; // Interface ID for LSP0ERC725Account

  beforeEach(async function () {
    [owner, nonOwner] = await ethers.getSigners();

    // Deploy the UniversalReceiverDelegateUAP contract
    const UniversalReceiverDelegateUAPFactory = await ethers.getContractFactory(
      "UniversalReceiverDelegateUAP"
    );
    universalReceiverDelegateUAP = (await UniversalReceiverDelegateUAPFactory.deploy()) as UniversalReceiverDelegateUAP;
    await universalReceiverDelegateUAP.waitForDeployment();
    universalReceiverDelegateUAPAddress = await universalReceiverDelegateUAP.getAddress();

    // Deploy a mock LSP0 contract
    const MockLSP0Factory = await ethers.getContractFactory("MockLSP0");
    mockLSP0 = (await MockLSP0Factory.deploy()) as MockLSP0;
    await mockLSP0.waitForDeployment();

    // Deploy a mock ERC725Y contract
    const MockERC725YFactory = await ethers.getContractFactory("MockERC725Y");
    mockERC725Y = (await MockERC725YFactory.deploy()) as MockERC725Y;
    await mockERC725Y.waitForDeployment();
    const mockERC725YAddress = await mockERC725Y.getAddress();

    // Set the ERC725Y instance in the mock LSP0 contract
    await mockLSP0.setERC725Y(mockERC725YAddress);

    // Deploy mock assistant contracts
    const MockAssistantFactory = await ethers.getContractFactory("MockAssistant");
    mockAssistant = (await MockAssistantFactory.deploy()) as MockAssistant;

    const MockScreenerAssistantFactory = await ethers.getContractFactory("MockScreenerAssistant");
    mockScreenerAssistant = (await MockScreenerAssistantFactory.deploy()) as MockScreenerAssistant;
  });

  describe("universalReceiverDelegate", function () {
    /*
    

    it("should invoke executive assistants when they are found", async function () {
      // Encode the assistant addresses
      const addresses = [mockAssistant.address];
      const numAddresses = ethers.utils.hexZeroPad(ethers.utils.hexlify(addresses.length), 2);
      const encodedAddresses = addresses.map((addr) =>
        ethers.utils.hexZeroPad(addr, 20)
      );
      const encodedData = ethers.utils.hexConcat([numAddresses, ...encodedAddresses]);

      // Mock getData to return the encoded addresses
      await mockERC725Y.setData([ethers.utils.keccak256("0x")], [encodedData]);

      // Mock the assistant's execute function
      await mockAssistant.setExecuteReturnValues(0, "0x");

      await expect(
        mockLSP0.callUniversalReceiverDelegate(
          universalReceiverDelegateUAP.address,
          await owner.getAddress(),
          0,
          ethers.utils.formatBytes32String("testTypeId"),
          "0x"
        )
      )
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(mockAssistant.address);
    });

    it("should evaluate screener assistants before invoking executive assistants", async function () {
      // Encode the executive assistant addresses
      const execAddresses = [mockAssistant.address];
      const numExecAddresses = ethers.utils.hexZeroPad(ethers.utils.hexlify(execAddresses.length), 2);
      const encodedExecAddresses = execAddresses.map((addr) =>
        ethers.utils.hexZeroPad(addr, 20)
      );
      const encodedExecData = ethers.utils.hexConcat([numExecAddresses, ...encodedExecAddresses]);

      // Encode the screener assistant addresses
      const screenerAddresses = [mockScreenerAssistant.address];
      const numScreenerAddresses = ethers.utils.hexZeroPad(
        ethers.utils.hexlify(screenerAddresses.length),
        2
      );
      const encodedScreenerAddresses = screenerAddresses.map((addr) =>
        ethers.utils.hexZeroPad(addr, 20)
      );
      const encodedScreenerData = ethers.utils.hexConcat([
        numScreenerAddresses,
        ...encodedScreenerAddresses,
      ]);

      // Mock getData to return the encoded addresses
      await mockERC725Y.setData(
        [ethers.utils.keccak256("execKey"), ethers.utils.keccak256("screenerKey")],
        [encodedExecData, encodedScreenerData]
      );

      // Mock the screener assistant's evaluate function
      await mockScreenerAssistant.setEvaluateReturnValue(true);

      // Mock the assistant's execute function
      await mockAssistant.setExecuteReturnValues(0, "0x");

      await expect(
        mockLSP0.callUniversalReceiverDelegate(
          universalReceiverDelegateUAP.address,
          await owner.getAddress(),
          0,
          ethers.utils.formatBytes32String("testTypeId"),
          "0x"
        )
      )
        .to.emit(universalReceiverDelegateUAP, "AssistantInvoked")
        .withArgs(mockAssistant.address);
    });

    it("should not invoke executive assistant if any screener assistant returns false", async function () {
      // Encode the executive assistant addresses
      const execAddresses = [mockAssistant.address];
      const numExecAddresses = ethers.utils.hexZeroPad(ethers.utils.hexlify(execAddresses.length), 2);
      const encodedExecAddresses = execAddresses.map((addr) =>
        ethers.utils.hexZeroPad(addr, 20)
      );
      const encodedExecData = ethers.utils.hexConcat([numExecAddresses, ...encodedExecAddresses]);

      // Encode the screener assistant addresses
      const screenerAddresses = [mockScreenerAssistant.address];
      const numScreenerAddresses = ethers.utils.hexZeroPad(
        ethers.utils.hexlify(screenerAddresses.length),
        2
      );
      const encodedScreenerAddresses = screenerAddresses.map((addr) =>
        ethers.utils.hexZeroPad(addr, 20)
      );
      const encodedScreenerData = ethers.utils.hexConcat([
        numScreenerAddresses,
        ...encodedScreenerAddresses,
      ]);

      // Mock getData to return the encoded addresses
      await mockERC725Y.setData(
        [ethers.utils.keccak256("execKey"), ethers.utils.keccak256("screenerKey")],
        [encodedExecData, encodedScreenerData]
      );

      // Mock the screener assistant's evaluate function to return false
      await mockScreenerAssistant.setEvaluateReturnValue(false);

      await expect(
        mockLSP0.callUniversalReceiverDelegate(
          universalReceiverDelegateUAP.address,
          await owner.getAddress(),
          0,
          ethers.utils.formatBytes32String("testTypeId"),
          "0x"
        )
      ).to.not.emit(universalReceiverDelegateUAP, "AssistantInvoked");
    });

    it("should revert if a screener assistant is not trusted", async function () {
      // Modify the isTrustedAssistant function to return false
      await universalReceiverDelegateUAP.setTrustedAssistant(mockScreenerAssistant.address, false);

      // Encode the executive assistant addresses
      const execAddresses = [mockAssistant.address];
      const numExecAddresses = ethers.utils.hexZeroPad(ethers.utils.hexlify(execAddresses.length), 2);
      const encodedExecAddresses = execAddresses.map((addr) =>
        ethers.utils.hexZeroPad(addr, 20)
      );
      const encodedExecData = ethers.utils.hexConcat([numExecAddresses, ...encodedExecAddresses]);

      // Encode the screener assistant addresses
      const screenerAddresses = [mockScreenerAssistant.address];
      const numScreenerAddresses = ethers.utils.hexZeroPad(
        ethers.utils.hexlify(screenerAddresses.length),
        2
      );
      const encodedScreenerAddresses = screenerAddresses.map((addr) =>
        ethers.utils.hexZeroPad(addr, 20)
      );
      const encodedScreenerData = ethers.utils.hexConcat([
        numScreenerAddresses,
        ...encodedScreenerAddresses,
      ]);

      // Mock getData to return the encoded addresses
      await mockERC725Y.setData(
        [ethers.utils.keccak256("execKey"), ethers.utils.keccak256("screenerKey")],
        [encodedExecData, encodedScreenerData]
      );

      await expect(
        mockLSP0.callUniversalReceiverDelegate(
          universalReceiverDelegateUAP.address,
          await owner.getAddress(),
          0,
          ethers.utils.formatBytes32String("testTypeId"),
          "0x"
        )
      ).to.be.revertedWith("UniversalReceiverDelegateUAP: Untrusted screener assistant");
    });

    it("should revert if an executive assistant is not trusted", async function () {
      // Modify the isTrustedAssistant function to return false
      await universalReceiverDelegateUAP.setTrustedAssistant(mockAssistant.address, false);

      // Encode the executive assistant addresses
      const execAddresses = [mockAssistant.address];
      const numExecAddresses = ethers.utils.hexZeroPad(ethers.utils.hexlify(execAddresses.length), 2);
      const encodedExecAddresses = execAddresses.map((addr) =>
        ethers.utils.hexZeroPad(addr, 20)
      );
      const encodedExecData = ethers.utils.hexConcat([numExecAddresses, ...encodedExecAddresses]);

      // Mock getData to return the encoded addresses
      await mockERC725Y.setData([ethers.utils.keccak256("execKey")], [encodedExecData]);

      await expect(
        mockLSP0.callUniversalReceiverDelegate(
          universalReceiverDelegateUAP.address,
          await owner.getAddress(),
          0,
          ethers.utils.formatBytes32String("testTypeId"),
          "0x"
        )
      ).to.be.revertedWith("UniversalReceiverDelegateUAP: Untrusted executive assistant");
    });

    it("should handle delegatecall failures and extract revert message", async function () {
      // Mock the screener assistant to revert with a message
      await mockScreenerAssistant.setShouldRevert(true, "Screener failed");

      // Encode the executive assistant addresses
      const execAddresses = [mockAssistant.address];
      const numExecAddresses = ethers.utils.hexZeroPad(ethers.utils.hexlify(execAddresses.length), 2);
      const encodedExecAddresses = execAddresses.map((addr) =>
        ethers.utils.hexZeroPad(addr, 20)
      );
      const encodedExecData = ethers.utils.hexConcat([numExecAddresses, ...encodedExecAddresses]);

      // Encode the screener assistant addresses
      const screenerAddresses = [mockScreenerAssistant.address];
      const numScreenerAddresses = ethers.utils.hexZeroPad(
        ethers.utils.hexlify(screenerAddresses.length),
        2
      );
      const encodedScreenerAddresses = screenerAddresses.map((addr) =>
        ethers.utils.hexZeroPad(addr, 20)
      );
      const encodedScreenerData = ethers.utils.hexConcat([
        numScreenerAddresses,
        ...encodedScreenerAddresses,
      ]);

      // Mock getData to return the encoded addresses
      await mockERC725Y.setData(
        [ethers.utils.keccak256("execKey"), ethers.utils.keccak256("screenerKey")],
        [encodedExecData, encodedScreenerData]
      );

      await expect(
        mockLSP0.callUniversalReceiverDelegate(
          universalReceiverDelegateUAP.address,
          await owner.getAddress(),
          0,
          ethers.utils.formatBytes32String("testTypeId"),
          "0x"
        )
      ).to.be.revertedWith("Screener failed");
    });

    it("should correctly decode addresses in customDecodeAddresses function", async function () {
      const addresses = [
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
      ];
      const numAddresses = ethers.utils.hexZeroPad(ethers.utils.hexlify(addresses.length), 2);
      const encodedAddresses = addresses.map((addr) =>
        ethers.utils.hexZeroPad(addr, 20)
      );
      const encodedData = ethers.utils.hexConcat([numAddresses, ...encodedAddresses]);

      const decodedAddresses = await universalReceiverDelegateUAP.customDecodeAddresses(
        encodedData
      );

      expect(decodedAddresses[0]).to.equal(addresses[0]);
      expect(decodedAddresses[1]).to.equal(addresses[1]);
    });
    */
  });
});
