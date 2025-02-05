import { ethers } from "hardhat";
import {
  LSP1UniversalReceiverDelegateUP__factory,
  LSP6KeyManager__factory, UniversalProfile,
  UniversalProfile__factory
} from "../typechain-types";
import { ALL_PERMISSIONS, PERMISSIONS } from "@lukso/lsp-smart-contracts";
import { toBigInt, zeroPadValue, toBeHex, Signer } from "ethers";

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
import { UniversalReceiverDelegateUAP } from "../typechain-types/contracts";

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
) => {
  // Deploy Universal Profile
  let ownerAddress = await EOA.getAddress();
  let browserControllerAddress = await browserController.getAddress();
  const universalProfile = await new UniversalProfile__factory(EOA).deploy(
    ownerAddress,
    {
      value: ethers.parseEther("10"),
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
    PERMISSIONS.SETDATA,
    PERMISSIONS.CALL,
    PERMISSIONS.SUPER_CALL,
    PERMISSIONS.SUPER_TRANSFERVALUE,
    PERMISSIONS.TRANSFERVALUE,
    PERMISSIONS.EXECUTE_RELAY_CALL,
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
  const permissionDataValue = combinePermissions(
    PERMISSIONS.SUPER_CALL,
  );
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
