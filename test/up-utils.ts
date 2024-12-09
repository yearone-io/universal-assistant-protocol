import { ethers } from 'hardhat';
import { LSP6KeyManager__factory, UniversalProfile__factory, UniversalReceiverDelegateUAP } from "../typechain-types";
import { ALL_PERMISSIONS, PERMISSIONS } from "@lukso/lsp-smart-contracts";
import {
  toBigInt,
  zeroPadValue,
  toBeHex, Signer
} from "ethers";

// ERC725Y Data Keys of each LSP
import { LSP1DataKeys } from '@lukso/lsp1-contracts';
import { LSP3DataKeys } from '@lukso/lsp3-contracts';
import { LSP4DataKeys } from '@lukso/lsp4-contracts';
import { LSP5DataKeys } from '@lukso/lsp5-contracts';
import { LSP6DataKeys } from '@lukso/lsp6-contracts';
import { LSP8DataKeys } from '@lukso/lsp8-contracts';
import { LSP9DataKeys } from '@lukso/lsp9-contracts';
import { LSP10DataKeys } from '@lukso/lsp10-contracts';
import { LSP12DataKeys } from '@lukso/lsp12-contracts';
import { LSP17DataKeys } from '@lukso/lsp17contractextension-contracts';

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


export const setupProfileWithKeyManagerWithURD = async (EOA: Signer) => {
  let ownerAddress = await EOA.getAddress();
  const universalProfile = await new UniversalProfile__factory(EOA).deploy(ownerAddress, {
    value: ethers.parseEther('10'),
  });

  const lsp6KeyManager = await new LSP6KeyManager__factory(EOA).deploy(
    await universalProfile.getAddress(),
  );

  const lsp6KeyManagerAddress = await lsp6KeyManager.getAddress();

  const UniversalReceiverDelegateUAPFactory = await ethers.getContractFactory(
    "UniversalReceiverDelegateUAP"
  );
  const universalReceiverDelegateUAP = (await UniversalReceiverDelegateUAPFactory.deploy()) as UniversalReceiverDelegateUAP;
  await universalReceiverDelegateUAP.waitForDeployment();


  await universalProfile
    .connect(EOA)
    .setDataBatch(
      [
        ERC725YDataKeys.LSP6['AddressPermissions[]'].length,
        ERC725YDataKeys.LSP6['AddressPermissions[]'].index + '00000000000000000000000000000000',
        ERC725YDataKeys.LSP6['AddressPermissions[]'].index + '00000000000000000000000000000001',
        ERC725YDataKeys.LSP6['AddressPermissions:Permissions'] + ownerAddress.substring(2),
        ERC725YDataKeys.LSP6['AddressPermissions:Permissions'] +
        (await universalReceiverDelegateUAP.getAddress()).substring(2),
        ERC725YDataKeys.LSP1.LSP1UniversalReceiverDelegate,
      ],
      [
        ethers.zeroPadValue(ethers.toBeHex(2), 16),
        ownerAddress,
        await universalReceiverDelegateUAP.getAddress(),
        ALL_PERMISSIONS,
        combinePermissions(PERMISSIONS.SUPER_CALL),
        await universalReceiverDelegateUAP.getAddress(),
      ],
    );

  await universalProfile.connect(EOA).transferOwnership(lsp6KeyManagerAddress);

  const claimOwnershipPayload = universalProfile.interface.getFunction('acceptOwnership').selector;

  await lsp6KeyManager.connect(EOA).execute(claimOwnershipPayload);

  return [universalProfile, lsp6KeyManager, universalReceiverDelegateUAP];
}

function combinePermissions(..._permissions: string[]) {
  let result: bigint = toBigInt(0);

  _permissions.forEach((permission) => {
    const permissionAsBN = toBigInt(permission);
    result = result | permissionAsBN;
  });

  return zeroPadValue(toBeHex(result), 32);
}
