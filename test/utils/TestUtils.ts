import { ethers } from "hardhat";
import { toBigInt, zeroPadValue, toBeHex, Signer, solidityPacked, parseEther, keccak256, toUtf8Bytes, AbiCoder } from "ethers";
import { ALL_PERMISSIONS, PERMISSIONS } from "@lukso/lsp-smart-contracts";
import {
  LSP1UniversalReceiverDelegateUP__factory,
  LSP6KeyManager__factory, UniversalProfile,
  LSP6KeyManager,
  UniversalProfile__factory,
  LSP1UniversalReceiverDelegateUP
} from "../../typechain-types";
import { UniversalReceiverDelegateUAP } from "../../typechain-types/contracts";
// ERC725Y Data Keys of each LSP
import { LSP1DataKeys } from "@lukso/lsp1-contracts";
import { LSP3DataKeys } from "@lukso/lsp3-contracts";
import { LSP4DataKeys } from "@lukso/lsp4-contracts";
import { LSP5DataKeys } from "@lukso/lsp5-contracts";
import { LSP6DataKeys } from "@lukso/lsp6-contracts";
import { LSP8DataKeys } from "@lukso/lsp8-contracts";
import { LSP9DataKeys } from "@lukso/lsp9-contracts";
import { LSP10DataKeys } from "@lukso/lsp10-contracts";
import { LSP12DataKeys } from "@lukso/lsp12-contracts";
import { LSP17DataKeys } from "@lukso/lsp17contractextension-contracts";
import ERC725, { ERC725JSONSchema } from "@erc725/erc725.js";
import uap from '../../schemas/UAP.json';

export function customEncodeAddresses(addresses: string[]): string {
    if (addresses.length > 65535) {
      throw new Error("Number of addresses exceeds uint16 capacity.");
    }
  
    // Use ethers v6 `solidityPacked` to encode the length and addresses
    const encoded = solidityPacked(
      ["uint16", ...Array(addresses.length).fill("address")],
      [addresses.length, ...addresses],
    );
  
    return encoded;
  }

export const ERC725YDataKeys = {
    LSP1: { ...LSP1DataKeys },
    LSP3: { ...LSP3DataKeys },
    LSP4: { ...LSP4DataKeys },
    LSP5: { ...LSP5DataKeys },
    LSP6: { ...LSP6DataKeys },
    LSP8: { ...LSP8DataKeys },
    LSP9: { ...LSP9DataKeys },
    LSP10: { ...LSP10DataKeys },
    LSP12: { ...LSP12DataKeys },
    LSP17: { ...LSP17DataKeys },
  } as const;
  
  const browserControllerPermissions = [
    PERMISSIONS.ADDCONTROLLER,
    PERMISSIONS.EDITPERMISSIONS,
    PERMISSIONS.SUPER_TRANSFERVALUE,
    PERMISSIONS.TRANSFERVALUE,
    PERMISSIONS.SUPER_CALL,
    PERMISSIONS.CALL,
    PERMISSIONS.SUPER_STATICCALL,
    PERMISSIONS.STATICCALL,
    PERMISSIONS.DEPLOY,
    PERMISSIONS.SUPER_SETDATA,
    PERMISSIONS.SETDATA,
    PERMISSIONS.ENCRYPT,
    PERMISSIONS.DECRYPT,
    PERMISSIONS.SIGN,
    PERMISSIONS.EXECUTE_RELAY_CALL
  ]
  
  export const setupProfileWithKeyManagerWithURD = async (
    EOA: Signer,
    browserController: Signer
  ): Promise<[UniversalProfile, LSP6KeyManager, LSP1UniversalReceiverDelegateUP]> => {
    // Deploy Universal Profile
    let ownerAddress = await EOA.getAddress();
    let browserControllerAddress = await browserController.getAddress();
    const universalProfile = await new UniversalProfile__factory(EOA).deploy(
      ownerAddress,
      {
        value: parseEther("10"),
      }
    );
  
    // Deploy Key Manager
    const lsp6KeyManager = await new LSP6KeyManager__factory(EOA).deploy(
      await universalProfile.getAddress()
    );
  
    const lsp6KeyManagerAddress = await lsp6KeyManager.getAddress();
  
    // Deploy the UniversalReceiverDelegate
    const lsp1universalReceiverDelegateUP = await new LSP1UniversalReceiverDelegateUP__factory(
      EOA,
    ).deploy();
    await lsp1universalReceiverDelegateUP.waitForDeployment();
  
  
    const delegatePermissions = combinePermissions(
      PERMISSIONS.REENTRANCY,
      PERMISSIONS.SUPER_SETDATA,
      PERMISSIONS.SETDATA
    );
  
    // Set data for controllers
    await universalProfile
      .connect(EOA)
      .setDataBatch(
        [
          ERC725YDataKeys.LSP6["AddressPermissions[]"].length,
          ERC725YDataKeys.LSP6["AddressPermissions[]"].index +
          "00000000000000000000000000000000", // Browser Controller index
          ERC725YDataKeys.LSP6["AddressPermissions[]"].index +
          "00000000000000000000000000000001", // Delegate index
          ERC725YDataKeys.LSP6["AddressPermissions:Permissions"] +
          ownerAddress.substring(2), // Browser Controller permissions
          ERC725YDataKeys.LSP6["AddressPermissions:Permissions"] +
          browserControllerAddress.substring(2), // Browser Controller permissions
          ERC725YDataKeys.LSP6["AddressPermissions:Permissions"] +
          (await lsp1universalReceiverDelegateUP.getAddress()).substring(2), // Delegate permissions
          ERC725YDataKeys.LSP1.LSP1UniversalReceiverDelegate, // LSP1 delegate
        ],
        [
          ethers.zeroPadValue(ethers.toBeHex(2), 16),
          ownerAddress,
          await lsp1universalReceiverDelegateUP.getAddress(),
          ALL_PERMISSIONS,
          combinePermissions(...browserControllerPermissions),
          delegatePermissions,
          await lsp1universalReceiverDelegateUP.getAddress(),
        ]
      );
  
    // Transfer ownership to Key Manager
    await universalProfile.connect(EOA).transferOwnership(lsp6KeyManagerAddress);
  
    const claimOwnershipPayload =
      universalProfile.interface.getFunction("acceptOwnership").selector;
  
    await lsp6KeyManager.connect(EOA).execute(claimOwnershipPayload);
  
    return [
      universalProfile,
      lsp6KeyManager,
      lsp1universalReceiverDelegateUP
    ];
  };
  
  export const grantBrowserExtensionUrdSetPermissions = async (
    EOA: Signer,
    browserController: Signer,
    universalProfile: UniversalProfile,
  ) => {
    const browserControllerAddress = await browserController.getAddress();
    const dataKey = ERC725YDataKeys.LSP6["AddressPermissions:Permissions"] +
      browserControllerAddress.substring(2);
    const dataValue = combinePermissions(
      ...browserControllerPermissions,
      PERMISSIONS.ADDUNIVERSALRECEIVERDELEGATE,
      PERMISSIONS.CHANGEUNIVERSALRECEIVERDELEGATE,
    );
  
    await universalProfile
      .connect(EOA)
      .setData(
          dataKey,
          dataValue
      );
  };
  
  
  export const setLSP1UniversalReceiverDelegate = async (
    browserController: Signer,
    universalProfile: UniversalProfile,
    permissions: string[],
  ) => {
  
    const UniversalReceiverDelegateUAPFactory = await ethers.getContractFactory(
      "UniversalReceiverDelegateUAP",
    );
    const universalReceiverDelegateUAP =
      (await UniversalReceiverDelegateUAPFactory.deploy()) as UniversalReceiverDelegateUAP;
    await universalReceiverDelegateUAP.waitForDeployment();
  
    const dataKey = ERC725YDataKeys.LSP1.LSP1UniversalReceiverDelegate;
    const urdAddress = await universalReceiverDelegateUAP.getAddress();
  
    const permissionDataKey = ERC725YDataKeys.LSP6["AddressPermissions:Permissions"] +
      urdAddress.substring(2);
    const permissionDataValue = combinePermissions(...permissions);
    await universalProfile
      .connect(browserController)
      .setDataBatch(
        [dataKey, permissionDataKey],
        [urdAddress, permissionDataValue]
      );
  
    return [universalReceiverDelegateUAP];
  };
  
  function combinePermissions(..._permissions: string[]) {
    let result: bigint = toBigInt(0);
  
    _permissions.forEach((permission) => {
      const permissionAsBN = toBigInt(permission);
      result = result | permissionAsBN;
    });
  
    return zeroPadValue(toBeHex(result), 32);
  }


export async function deployUniversalProfile(
  owner: Signer,
  controller: Signer,
  permissions: string[] = [PERMISSIONS.SUPER_CALL, PERMISSIONS.REENTRANCY]
) {
  const [up,, urd] = await setupProfileWithKeyManagerWithURD(owner, controller);
  await grantBrowserExtensionUrdSetPermissions(owner, controller, up);
  const [uap] = await setLSP1UniversalReceiverDelegate(controller, up, permissions);
  return { universalProfile: up, universalReceiverDelegateUAP: uap, lsp1URD: urd };
}

export async function deployMockAssets(holder: Signer) {
  const MockLSP7Factory = await ethers.getContractFactory("MockLSP7DigitalAsset");
  const lsp7 = await MockLSP7Factory.deploy("Mock LSP7", "MLSP7", await holder.getAddress());
  await lsp7.waitForDeployment();

  const MockLSP8Factory = await ethers.getContractFactory("MockLSP8IdentifiableDigitalAsset");
  const lsp8 = await MockLSP8Factory.deploy("Mock LSP8", "MLSP8", await holder.getAddress());
  await lsp8.waitForDeployment();

  return { lsp7, lsp8 };
}

export function generateMappingKey(keyName: string, typeId: string): string {
  const hashedKey = keccak256(toUtf8Bytes(keyName));
  const first10Bytes = hashedKey.slice(2, 22);
  const last20Bytes = typeId.slice(2, 42);
  return "0x" + first10Bytes + "0000" + last20Bytes;
}

export function generateExecutiveScreenersKey(erc725UAP: ERC725, typeId: string, order: number): string {
  return erc725UAP.encodeKeyName("UAPExecutiveScreeners:<bytes32>:<uint256>", [typeId, order.toString()]);
}

export function generateScreenersChainLogicKey(erc725UAP: ERC725, typeId: string, order: number): string {
  return erc725UAP.encodeKeyName("UAPExecutiveScreenersANDLogic:<bytes32>:<uint256>", [typeId, order.toString()]);
}

export function generateScreenerConfigKey(typeId: string, executiveAddress: string, screenerAddress: string): string {
  const hashedFirstWord = keccak256(toUtf8Bytes("UAPScreenerConfig"));
  const first6Bytes = hashedFirstWord.slice(2, 14);
  const second4Bytes = typeId.slice(2, 10);
  const last20Bytes = executiveAddress.slice(2, 22) + screenerAddress.slice(2, 22);
  return "0x" + first6Bytes + second4Bytes + "0000" + last20Bytes;
}

export function encodeBoolValue(value: boolean): string {
  return value ? "0x0000000000000000000000000000000000000000000000000000000000000001" : "0x0000000000000000000000000000000000000000000000000000000000000000";
}

export async function setScreenerConfig(
  erc725UAP: ERC725,
  up: any,
  executive: string,
  order: number,
  screeners: string[],
  typeId: string,
  screenerConfigs: string[],
  isAndChain: boolean = true
) {
  const screenersKey = generateExecutiveScreenersKey(erc725UAP, typeId, order);
  const logicKey = generateScreenersChainLogicKey(erc725UAP, typeId, order);

  await up.setData(screenersKey, erc725UAP.encodeValueType("address[]", screeners));
  await up.setData(logicKey, encodeBoolValue(isAndChain));
  for (let i = 0; i < screeners.length; i++) {
    const screener = screeners[i];
    const config = screenerConfigs[i];
    if (config.length > 0) {
      await up.setData(generateScreenerConfigKey(typeId, executive, screener), config);
    }
  }
}

export async function setExecutiveConfig(up: any, executive: string, config: string) {
  const configKey = generateMappingKey("UAPExecutiveConfig", executive);
  await up.setData(configKey, config);
}

export function addressToBytes32(address: string): string {
  if (address.startsWith("0x")) address = address.slice(2);
  const paddedAddress = "0".repeat(64 - address.length) + address;
  return "0x" + paddedAddress.toLowerCase();
}

export function generateListMappingKey(executiveAddress: string, screenerAddress: string, itemAddress: string): string {
  const hashedFirstWord = keccak256(toUtf8Bytes("UAPList"));
  const first6Bytes = hashedFirstWord.slice(2, 14);
  const executiveBytes4 = executiveAddress.slice(2, 10);
  const screenerBytes10 = screenerAddress.slice(2, 22);
  const itemBytes10 = itemAddress.slice(2, 22);
  return "0x" + first6Bytes + executiveBytes4 + "0000" + screenerBytes10 + itemBytes10;
}

// Generates the list set key (mirrors contract logic)
export function generateListSetKey(executiveAddress: string, screenerAddress: string): string {
  const hashedFirstWord = ethers.keccak256(ethers.toUtf8Bytes("UAPList"));
  const first6Bytes = hashedFirstWord.slice(2, 14);
  const executiveBytes4 = executiveAddress.slice(2, 10);
  const screenerBytes10 = screenerAddress.slice(2, 22);
  const endingBytes10 = "0".repeat(16) + "5b5d"
  return "0x" + first6Bytes + executiveBytes4 + "0000" + screenerBytes10 + endingBytes10;
}

// Reads the current list set from the Universal Profile
export async function getListSet(up: UniversalProfile, executiveAddress: string, screenerAddress: string): Promise<string[]> {
  const setKey = generateListSetKey(executiveAddress, screenerAddress);
  const value = await up.getData(setKey);
  if (value === "0x" || value.length === 0) return [];
  return ethers.AbiCoder.defaultAbiCoder().decode(["address[]"], value)[0];
}

// Adds an address to the list set if not already present
export async function addToListSetPayload(up: UniversalProfile, executiveAddress: string, screenerAddress: string, itemAddress: string) {
  const currentSet = await getListSet(up, executiveAddress, screenerAddress);
  if (currentSet.includes(itemAddress)) return ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [currentSet]);
  const newSet = [...currentSet, itemAddress];
  const encodedValue = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [newSet]);
  return encodedValue;
}

// Removes an address from the list set if present
export async function removeFromListSetPayload(up: UniversalProfile, executiveAddress: string, screenerAddress: string, itemAddress: string) {
  const currentSet = await getListSet(up, executiveAddress, screenerAddress);
  const index = currentSet.indexOf(itemAddress);
  if (index === -1) return ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [currentSet]);
  const newSet = currentSet.filter((_, i) => i !== index);
  const encodedValue = newSet.length ? ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [newSet]) : "0x";
  return encodedValue;
}

// Sets or removes an address in the list (combines mapping and set operations)
export async function setListEntry(up: UniversalProfile, executiveAddress: string, screenerAddress: string, itemAddress: string, isInList: boolean) {
  const mappingKey = generateListMappingKey(executiveAddress, screenerAddress, itemAddress);
  const setKey = generateListSetKey(executiveAddress, screenerAddress);
  const value = isInList ? ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]) : "0x";
  let listPayload = "0x"
  if (isInList) {
    listPayload = await addToListSetPayload(up, executiveAddress, screenerAddress, itemAddress);
  } else {
    listPayload = await removeFromListSetPayload(up, executiveAddress, screenerAddress, itemAddress);
  }
  await up.setDataBatch([mappingKey, setKey], [value, listPayload]);
}