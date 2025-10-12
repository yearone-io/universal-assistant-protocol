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
import ERC725, { encodeData } from "@erc725/erc725.js";

/**
 * Encodes tuple key-value pairs using the official ERC725.js encodeData function.
 * This function wraps the official API for backward compatibility with the old encodeTupleKeyValue.
 *
 * The encoding format is:
 * - For "(Address,Bytes)" => concatenates: address (20 bytes) + bytes (variable)
 * - For "(Address,Address,Bytes)" => concatenates: address (20 bytes) + address (20 bytes) + bytes (variable)
 *
 * @param keyType - The key type (e.g., "(Address,Bytes)")
 * @param valueType - The value type (e.g., "(address,bytes)")
 * @param values - Array of values to encode
 * @returns Hex-encoded bytes string
 */
export function encodeTupleKeyValue(
  keyType: string,
  valueType: string,
  values: any[]
): string {
  // The tempSchema is just boilerplate to access ERC725's internal tuple encoding logic.
  // We only care about the encoded VALUE (result.values[0]), not the key hash.
  // The key must match keccak256(name) for validation, but the actual name doesn't matter.
  const tempSchema = [{
    name: 'TempKey',
    key: '0x817d21792a7e78e5e6e0fba4a0f1e94419ad7134b94ff5cf56ad11b464ad7d2b', // keccak256('TempKey')
    keyType: 'Singleton',
    valueType: valueType,
    valueContent: keyType
  }];

  const result = encodeData({
    keyName: 'TempKey',
    value: values
  }, tempSchema);

  return result.values[0]; // Return only the encoded value, ignore the key
}

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

export function encodeBoolValue(value: boolean): string {
  return value ? "0x01" : "0x00";
}

export async function setScreenerConfig(
  erc725UAP: ERC725,
  up: any,
  executive: string,
  executiveOrder: number,
  screeners: string[],
  typeId: string,
  screenerConfigs: string[],
  isAndChain: boolean = true
) {
  const screenersKey = generateExecutiveScreenersKey(erc725UAP, typeId, executiveOrder);
  const logicKey = generateScreenersChainLogicKey(erc725UAP, typeId, executiveOrder);

  await up.setData(screenersKey, erc725UAP.encodeValueType("address[]", screeners));
  await up.setData(logicKey, encodeBoolValue(isAndChain));
  for (let i = 0; i < screeners.length; i++) {
    const screener = screeners[i];
    const screenerConfig = screenerConfigs[i];
    if (screenerConfig.length > 0) {
      const screenerOrder = 1000 * executiveOrder + i;
      const screenerKey = erc725UAP.encodeKeyName("UAPScreenerConfig:<bytes32>:<uint256>", [typeId, screenerOrder.toString()]);
      const screenerData = encodeTupleKeyValue("(Address,Address,Bytes)", "(address,address,bytes)", [executive, screener, screenerConfig]);
      await up.setData(screenerKey, screenerData);
    }
  }
}

export async function setExecutiveConfig(
  erc725Instance: ERC725,
  up: any,
  executiveAddress: string,
  type: string,
  order: number,
  execConfig: string
) {
  const executiveKey = erc725Instance.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [type, order.toString()]);
  const execData = encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [executiveAddress, execConfig]);
  await up.setData(executiveKey, execData);
}

export function addressToBytes32(address: string): string {
  if (address.startsWith("0x")) address = address.slice(2);
  const paddedAddress = "0".repeat(64 - address.length) + address;
  return "0x" + paddedAddress.toLowerCase();
}

export function toSolidityBytes16(index: number) {
  const maxUint128 = BigInt("340282366920938463463374607431768211455");
  const num = BigInt(index);
  if (num < 0 || num > maxUint128) {
    throw new Error("Number out of uint128 range");
  }
  return num.toString(16).padStart(32, "0");
}

export function toSolidityBytes32Prefixed(index: number) {
  const maxUint128 = BigInt("340282366920938463463374607431768211455");
  const num = BigInt(index);
  if (num < 0 || num > maxUint128) {
    throw new Error("Number out of uint128 range");
  }
  return "0x" + num.toString(16).padStart(64, "0");
}

export function generateListItemIndexKey(erc725Instance: ERC725, listName: string, index: number) {
  const encodedKeyName: string = erc725Instance.encodeKeyName(`${listName}[]`);
  return encodedKeyName.slice(0, 34) + toSolidityBytes16(index);
}

export function encodeListMapValue(erc725Instance: ERC725, bytes4Value: string, uint256Value: number) {
  return bytes4Value + erc725Instance.encodeValueType("uint256", uint256Value).slice(2, 66);
}

export async function setListNameOnScreener(
  erc725Instance: ERC725,
  up: UniversalProfile,
  typeId: string,
  executionOrder: number,
  listName: string
) {
  const listNameKey = erc725Instance.encodeKeyName("UAPAddressListName:<bytes32>:<uint256>", [typeId, executionOrder.toString()]);
  return await up.setData(listNameKey, erc725Instance.encodeValueType("string", listName));
}

export async function mergeListEntry(
  erc725Instance: ERC725,
  up: UniversalProfile,
  listName: string,
  itemAddress: string,
  itemType: string, // bytes4
) {
  // get current list length
  const listLengthKey = erc725Instance.encodeKeyName(`${listName}[]`);
  const listLengthRaw = await up.getData(listLengthKey);
  let listLength = 0;
  if (listLengthRaw && listLengthRaw !== "0x") {
    listLength = Number(erc725Instance.decodeValueType("uint256", listLengthRaw));
  }
  // check if mapping is present
  const entryMapKey = erc725Instance.encodeKeyName(`${listName}Map:<address>`, [itemAddress]);
  const entryRaw = await up.getData(entryMapKey);
  if (!entryRaw || entryRaw === "0x") {
    // if mapping not present: add address to end of list and create mapping
    await up.setDataBatch(
      [
        entryMapKey,
        generateListItemIndexKey(erc725Instance, listName, listLength),
        listLengthKey
      ],
      [
        encodeListMapValue(erc725Instance, itemType, listLength),
        itemAddress,
        toSolidityBytes32Prefixed(listLength + 1),
      ]
    );
  } else {
    // if yes get index and confirm index < listLength and address is present at index spot
    let entryIndex = Number(erc725Instance.decodeValueType("uint256", "0x" + entryRaw.slice(10)));
    if (entryIndex >= listLength - 1) {
      throw Error("index mismatch");
    }
    return;
  }
}

export async function removeListEntry(
  erc725Instance: ERC725,
  up: UniversalProfile,
  listName: string,
  itemAddress: string,
) {
  const entryMapKey = erc725Instance.encodeKeyName(`${listName}Map:<address>`, [itemAddress]);
  const entryRaw = await up.getData(entryMapKey);
  if (!entryRaw || entryRaw === "0x") {
    return;
  }
  let entryIndex = Number(erc725Instance.decodeValueType("uint256", "0x" + entryRaw.slice(10)));
  const entryIndexKey = generateListItemIndexKey(erc725Instance, listName, entryIndex);
  const listLengthKey = erc725Instance.encodeKeyName(`${listName}[]`);
  const listLengthRaw = await up.getData(listLengthKey);
  let listLength = 0;
  if (listLengthRaw && listLengthRaw !== "0x") {
    listLength = Number(erc725Instance.decodeValueType("uint256", listLengthRaw));
  }
  if (listLength === 0) {
    await up.setData(entryMapKey, "0x");
    return;
  }
  const lastItemIndexKey = generateListItemIndexKey(erc725Instance, listName, listLength - 1);
  if (entryIndex === listLength - 1) {
    await up.setDataBatch(
      [
        entryMapKey,
        lastItemIndexKey,
        listLengthKey
      ],
      [
        "0x",
        "0x",
        toSolidityBytes32Prefixed(listLength - 1)
      ]
    )
  } else {
    const lastItemValueRaw = await up.getData(lastItemIndexKey);
    const lastItemAddress = erc725Instance.decodeValueType("address", lastItemValueRaw);
    const lastItemMappingKey = erc725Instance.encodeKeyName(`${listName}Map:<address>`, [lastItemAddress]);
    const lastItemMappingRaw = await up.getData(lastItemMappingKey);
    const lastItemEntryType = erc725Instance.decodeValueType("bytes4", lastItemMappingRaw.slice(0,10));
    const newMappingValue = encodeListMapValue(erc725Instance, lastItemEntryType, entryIndex);
    await up.setDataBatch(
      [
        entryIndexKey,
        lastItemIndexKey,
        entryMapKey,
        lastItemMappingKey,
        listLengthKey
      ],
      [
        lastItemAddress,
        "0x",
        "0x",
        newMappingValue,
        toSolidityBytes32Prefixed(listLength - 1)
      ]
    )
  }
}