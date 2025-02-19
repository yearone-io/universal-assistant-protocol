import { ethers } from "hardhat";

export function customEncodeAddresses(addresses: string[]): string {
    if (addresses.length > 65535) {
      throw new Error("Number of addresses exceeds uint16 capacity.");
    }
  
    // Use ethers v6 `solidityPacked` to encode the length and addresses
    const encoded = ethers.solidityPacked(
      ["uint16", ...Array(addresses.length).fill("address")],
      [addresses.length, ...addresses],
    );
  
    return encoded;
  }