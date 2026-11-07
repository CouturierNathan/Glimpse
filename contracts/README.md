# Contracts (pole C)

Hardhat 3, Solidity 0.8.34, viem. Network: **Base Sepolia** (chain id 84532): cheap, fast blocks,
public RPC `https://sepolia.base.org`, explorer https://sepolia.basescan.org.

| Contract              | Role                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `IssuerRegistry`      | Public directory: issuerId → admin, signer key, public metadata. Open registration, no trust list: each requester picks its issuers.   |
| `AttestationRegistry` | Anchors an issuer-signed (EIP-712) attestation: id, issuer, salted commitment, validity. Revocation by the issuer, events, `statusOf`. |

`attestation.ts` holds the EIP-712 types and the commitment that the issuer, the holder and the
verifier must compute the same way.

## What goes on chain

Only the opaque attestation id, the issuer id and signer, `keccak256(abi.encode(salt, attestationId,
holder, attribute, valueType, valueJson))` with a random 32-byte salt, and the validity and
revocation times. Holder, attribute and value stay off chain, encrypted in the holder's vault; the
salt travels with them, so only someone the holder shares with can check the commitment.

## Commands

```sh
npm test -w contracts            # compile, typecheck, run the tests on a local chain
npm run demo -w contracts        # sign, anchor, read back, check and revoke on a local chain
```

Deploy to Base Sepolia (the deployer needs a little Base Sepolia ETH):

```sh
npx hardhat keystore set BASE_SEPOLIA_PRIVATE_KEY   # once, from contracts/; asks a password
npm run deploy:base-sepolia -w contracts
npm run demo -w contracts -- --network baseSepolia  # KEEP=1 keeps the attestation unrevoked
```

Addresses of the shared deployment: `ignition/deployments/chain-84532/deployed_addresses.json`.
