import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { ERC725YDataKeys, LSP1_TYPE_IDS } from "@lukso/lsp-smart-contracts";
import LSP0ERC725Account from "@lukso/lsp-smart-contracts/artifacts/LSP0ERC725Account.json";
import LSP6KeyManager from "@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json";
import { ERC725, ERC725JSONSchema } from '@erc725/erc725.js';
import LSP6Schema from '@erc725/erc725.js/schemas/LSP6KeyManager.json';
import { UniversalReceiverDelegateUAP, ForwarderAssistant, MockLSP0, MockAssistant, MockLSP8IdentifiableDigitalAsset, MockBadAssistant, MockTrueScreenerAssistant, MockFalseScreenerAssistant, MockBadScreenerAssistant, MockERC725Y } from "../typechain-types";
import LSP1UniversalReceiverDelegateSchemas from '@erc725/erc725.js/schemas/LSP1UniversalReceiverDelegate.json';
import LSP6KeyManagerSchemas from '@erc725/erc725.js/schemas/LSP6KeyManager.json';
import config from "../hardhat.config";

export const DEFAULT_UP_URD_PERMISSIONS = {
  REENTRANCY: true,
  SUPER_SETDATA: true,
  SETDATA: true,
};

export const DEFAULT_UP_CONTROLLER_PERMISSIONS = {
  CHANGEOWNER: false,
  ADDCONTROLLER: true,
  EDITPERMISSIONS: true,
  ADDEXTENSIONS: false,
  CHANGEEXTENSIONS: false,
  ADDUNIVERSALRECEIVERDELEGATE: false,
  CHANGEUNIVERSALRECEIVERDELEGATE: false,
  REENTRANCY: false,
  SUPER_TRANSFERVALUE: true,
  TRANSFERVALUE: true,
  SUPER_CALL: true,
  CALL: true,
  SUPER_STATICCALL: true,
  STATICCALL: true,
  SUPER_DELEGATECALL: false,
  DELEGATECALL: false,
  DEPLOY: true,
  SUPER_SETDATA: true,
  SETDATA: true,
  ENCRYPT: true,
  DECRYPT: true,
  SIGN: true,
  EXECUTE_RELAY_CALL: true
}

describe("UniversalReceiverDelegateUAP", function () {
  let owner: Signer;
  let mainController: Signer;
  let nonOwner: Signer;
  let LSP8Holder: Signer;
  let universalReceiverDelegateUAP: UniversalReceiverDelegateUAP;
  let universalReceiverDelegateUAPAddress: string;
  let mockLSP0: MockLSP0;
  let mockLSP0Address: string;
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
  let forwarderAssistant: ForwarderAssistant;
  let forwarderAssistantAddress: string;
  let mockLSP8: MockLSP8IdentifiableDigitalAsset;
  let mockLSP8Address: string;
  let mockUP: any;
  let keyManager: any;
  let keyManagerAddress: string;
  let mockUPAddress: string;

  beforeEach(async function () {
    [owner, mainController, nonOwner, LSP8Holder] = await ethers.getSigners();
    const ownerAddress = await owner.getAddress();

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
    mockLSP0Address = await mockLSP0.getAddress();

    // Deploy mock ERC725Y (storage)
    const MockERC725YFactory = await ethers.getContractFactory("MockERC725Y");
    mockERC725Y = (await MockERC725YFactory.deploy()) as MockERC725Y;
    await mockERC725Y.waitForDeployment();
    const mockERC725YAddress = await mockERC725Y.getAddress();

    // Set the ERC725Y instance in the mock LSP0 contract
    await mockLSP0.setERC725Y(mockERC725YAddress);

    // deploy UP account
    /*
    const UPAccountFactory = new ethers.ContractFactory(LSP0ERC725Account.abi, LSP0ERC725Account.bytecode, owner);
    
    mockUP = (await UPAccountFactory.connect(owner).deploy(ownerAddress));
    console.log("UP owner:", await mockUP.owner());
    await mockUP.waitForDeployment();
    mockUPAddress = await mockUP.getAddress();
    console.log("UP deployed to: ", mockUPAddress);
    const MockKeyManagerFactory = new ethers.ContractFactory(LSP6KeyManager.abi, LSP6KeyManager.bytecode, owner);
    keyManager = (await MockKeyManagerFactory.connect(owner).deploy(owner));
    await keyManager.waitForDeployment();
    keyManagerAddress = await keyManager.getAddress();
    console.log("KeyManager deployed to: ", keyManagerAddress);
    const transferOwnershipTx = await mockUP.transferOwnership(keyManagerAddress);
    transferOwnershipTx.wait();
    console.log("Transfer Ownership Tx", transferOwnershipTx);
    const acceptOwnershipBytes = mockUP.interface.encodeFunctionData('acceptOwnership');
    console.log("Accept Ownership Bytes", acceptOwnershipBytes);
    await keyManager.connect(owner).execute(acceptOwnershipBytes);
    */

    const permissionsKey = generateMappingWithGroupingKey("AddressPermissions", "Permissions", ownerAddress);
    console.log("permissions key", permissionsKey);
    console.log("Owner Permissions", await mockUP.getData(generateMappingWithGroupingKey("AddressPermissions", "Permissions", ownerAddress)));

    // Deploy mock assistant contracts
    const MockAssistantFactory = await ethers.getContractFactory("MockAssistant");
    mockAssistant = (await MockAssistantFactory.deploy()) as MockAssistant;
    mockAssistantAddress = await mockAssistant.getAddress();

    const MockBadAssistantFactory = await ethers.getContractFactory("MockBadAssistant");
    mockBadAssistant = (await MockBadAssistantFactory.deploy()) as MockBadAssistant;
    mockBadAssistantAddress = await mockBadAssistant.getAddress();

    const ForwarderAssistantFactory = await ethers.getContractFactory("ForwarderAssistant");
    forwarderAssistant = (await ForwarderAssistantFactory.deploy()) as ForwarderAssistant;
    await forwarderAssistant.waitForDeployment();
    forwarderAssistantAddress = await forwarderAssistant.getAddress();

    const MockLSP8Factory = await ethers.getContractFactory("MockLSP8IdentifiableDigitalAsset");
    mockLSP8 = (await MockLSP8Factory.deploy("Mock LSP8 Token", "MLSP8", await LSP8Holder.getAddress())) as MockLSP8IdentifiableDigitalAsset;
    await mockLSP8.waitForDeployment();
    mockLSP8Address = await mockLSP8.getAddress();
    console.log("MockLSP8IdentifiableDigitalAsset deployed to: ", mockLSP8Address);

    const MockTrueScreenerAssistantFactory = await ethers.getContractFactory("MockTrueScreenerAssistant");
    mockTrueScreenerAssistant = (await MockTrueScreenerAssistantFactory.deploy()) as MockTrueScreenerAssistant;
    mockTrueScreenerAssistantAddress = await mockTrueScreenerAssistant.getAddress();

    const MockFalseScreenerAssistantFactory = await ethers.getContractFactory("MockFalseScreenerAssistant");
    mockFalseScreenerAssistant = (await MockFalseScreenerAssistantFactory.deploy()) as MockFalseScreenerAssistant;
    mockFalseScreenerAssistantAddress = await mockFalseScreenerAssistant.getAddress();

    const MockBadScreenerAssistantFactory = await ethers.getContractFactory("MockBadScreenerAssistant");
    mockBadScreenerAssistant = (await MockBadScreenerAssistantFactory.deploy()) as MockBadScreenerAssistant;
    mockBadScreenerAssistantAddress = await mockBadScreenerAssistant.getAddress();

    console.log("mockUPAddress: ", mockUPAddress);
    
    const upPermissions = new ERC725(
      LSP6Schema as ERC725JSONSchema[],
      /*
      mockUPAddress,
      // @ts-ignore
      config.networks!.luksoTestnet!.url as string
      */
    );


    // const currentPermissionsData = await upPermissions.getData();
    // const currentControllers = currentPermissionsData[0].value as string[];
    const ownerPermissions = upPermissions.encodePermissions({
      ...DEFAULT_UP_CONTROLLER_PERMISSIONS,
    });
    const urdPermissions = upPermissions.encodePermissions({
        SUPER_CALL: true,
        ...DEFAULT_UP_URD_PERMISSIONS,
      });

    const urdPermissionsData = upPermissions.encodeData([
        {
          keyName: 'AddressPermissions:Permissions:<address>',
          dynamicKeyParts: ownerAddress,
          value: ownerPermissions,
        },
        {
          keyName: 'AddressPermissions:Permissions:<address>',
          dynamicKeyParts: universalReceiverDelegateUAPAddress,
          value: urdPermissions,
        },
        // the new list controllers addresses (= addresses with permissions set on the UP)
        // + or -  1 in the `AddressPermissions[]` array length
        {
          keyName: 'AddressPermissions[]',
          value: [ownerAddress, universalReceiverDelegateUAPAddress],
        },
      ]);
    
    const setDataBatchTx = await mockUP.connect(owner).setDataBatch(
      [...urdPermissionsData.keys],
      [...urdPermissionsData.values]
    );
    await setDataBatchTx.wait();

    typeMappingKey = generateMappingKey('UAPTypeConfig', LSP1_TYPE_IDS.LSP7Tokens_RecipientNotification);
    nonStandardTypeMappingKey = generateMappingKey('UAPTypeConfig', LSP1_TYPE_IDS.LSP0ValueReceived);

    const MAIN_CONTROLLER = ownerAddress;
    const erc725 = new ERC725([
      ...LSP6KeyManagerSchemas as ERC725JSONSchema[],
      ...LSP1UniversalReceiverDelegateSchemas as ERC725JSONSchema[]
    ]);
    const setDataKeysAndValues = erc725.encodeData([
      {
        keyName: 'LSP1UniversalReceiverDelegate',
        value: universalReceiverDelegateUAPAddress,
      }, // Universal Receiver data key and value
      {
        keyName: 'AddressPermissions:Permissions:<address>',
        dynamicKeyParts: [universalReceiverDelegateUAPAddress],
        value: erc725.encodePermissions({
          REENTRANCY: true,
          SUPER_SETDATA: true,
        }),
      }, // Universal Receiver Delegate permissions data key and value
      {
        keyName: 'AddressPermissions:Permissions:<address>',
        dynamicKeyParts: [ownerAddress],
        value: erc725.encodePermissions({
          CHANGEOWNER: true,
          ADDCONTROLLER: true,
          EDITPERMISSIONS: true,
          ADDEXTENSIONS: true,
          CHANGEEXTENSIONS: true,
          ADDUNIVERSALRECEIVERDELEGATE: true,
          CHANGEUNIVERSALRECEIVERDELEGATE: true,
          REENTRANCY: false,
          SUPER_TRANSFERVALUE: true,
          TRANSFERVALUE: true,
          SUPER_CALL: true,
          CALL: true,
          SUPER_STATICCALL: true,
          STATICCALL: true,
          SUPER_DELEGATECALL: false,
          DELEGATECALL: false,
          DEPLOY: true,
          SUPER_SETDATA: true,
          SETDATA: true,
          ENCRYPT: true,
          DECRYPT: true,
          SIGN: true,
          EXECUTE_RELAY_CALL: true,
        }), // Main Controller permissions data key and value
      },
      // Address Permissions array length = 2, and the controller addresses at each index
      {
        keyName: 'AddressPermissions[]',
        value: [universalReceiverDelegateUAPAddress, ownerAddress],
      },
    ]);

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

    it("should forward LSP8 tokens to the target address using the ForwarderAssistant", async function () {
      // Generate and set the type config data
      const typeMappingKey = generateMappingKey('UAPTypeConfig', LSP1_TYPE_IDS.LSP8Tokens_RecipientNotification);
      const encodedAssistantsData = customEncodeAddresses([forwarderAssistantAddress]);
      await mockUP.setData(typeMappingKey, encodedAssistantsData);
  
      // Generate and set the executive config data
      const assistantInstructionsKey = generateMappingKey('UAPExecutiveConfig', forwarderAssistantAddress);
      const targetAddress = await nonOwner.getAddress();
      const abi = new ethers.AbiCoder;
      const encodedInstructions = abi.encode(["address"], [targetAddress]);
      await mockUP.setData(assistantInstructionsKey, encodedInstructions);

      // Generate and set the URDUAP as the default URD for LSP8 tokens
      const LSP8URDdataKey = ERC725YDataKeys.LSP1.LSP1UniversalReceiverDelegatePrefix +
        LSP1_TYPE_IDS.LSP8Tokens_RecipientNotification.slice(2).slice(0, 40);
      const URDAddress = universalReceiverDelegateUAPAddress;
      await mockUP.setData(LSP8URDdataKey, URDAddress);
      console.log("URD Address", await mockUP.getData(LSP8URDdataKey));

      // Give the URDUAP the necessary permissions

  
      // Mint an LSP8 token to owner
      const tokenId = "0x0000000000000000000000000000000000000000000000000000000000000001";
      await mockLSP8.connect(LSP8Holder).mint(LSP8Holder, tokenId);
  
      // Transfer the LSP8 token to the LSP0 (UP)
      console.log(`\n\nAsset: ${mockLSP8Address}`);
      console.log(`Sender: ${await LSP8Holder.getAddress()}`);
      console.log(`Intended Receiver: ${mockUPAddress}`);
      console.log(`Redirected Receiver: ${targetAddress}\n\n`);
      await mockLSP8.connect(LSP8Holder).transfer(await LSP8Holder.getAddress(), mockUPAddress, tokenId, true, "0x");
  
      // Check that the token has been forwarded to the target address
      const tokenOwner = await mockLSP8.tokenOwnerOf(tokenId);
      expect(tokenOwner).to.equal(targetAddress);
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

export const generateMappingWithGroupingKey = (firstWord: string, secondWord: string, address: string): string => {
  const hashedFirstWord = ethers.keccak256(ethers.toUtf8Bytes(firstWord));
  const hashedSecondWord = ethers.keccak256(ethers.toUtf8Bytes(secondWord));
  const first6Bytes = hashedFirstWord.slice(2, 14);
  const second4Bytes = hashedSecondWord.slice(2, 10);
  const last20Bytes = address.slice(2, 42);
  return '0x' + first6Bytes + second4Bytes + '0000' + last20Bytes;
}

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
