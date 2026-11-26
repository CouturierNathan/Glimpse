# Architecture

Three actors, one rule: the holder decides, the requester checks on its own, and the server only
stores ciphertext and routes requests.

```
 Issuer (organisation)          Holder (browser)                     Requester (browser)
 /issuer                        /dashboard, /import, /consent        /verify
   │ EIP-712 signature            │ keys in memory, encrypts            │ signs a VerificationRequest
   │ anchor(commitment)           │ every item before upload            │ decrypts the shared item
   ▼                              ▼                                     ▼
 AttestationRegistry ◄──── reads ──────────────────────────────── packages/verifier
 IssuerRegistry               Next.js API (apps/web/src/app/api)
 (Base Sepolia)               SIWE sessions, ciphertext store, request routing,
                              PAdES check, LLM extraction (in memory)
```

## Packages

| Path                 | Role                                                                                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/`          | Next 16 app and API. Sign-in with Ethereum, France Identité PAdES check, document import, issuer portal, consent screen, requester verification.                                                                                          |
| `packages/vault/`    | Hybrid encryption (AES-GCM item keys wrapped with RSA-OAEP), encrypted storage adapters (memory, file), share envelopes for one requester key, consent-gated LLM extraction. See [packages/vault/README.md](../packages/vault/README.md). |
| `packages/verifier/` | `verify()`: signature, provenance, integrity, validity, revocation and replay checks, reading the chain directly. Event indexer for the registries.                                                                                       |
| `contracts/`         | `IssuerRegistry` and `AttestationRegistry` (Solidity, Hardhat 3). See [contracts/README.md](../contracts/README.md).                                                                                                                      |
| `packages/shared/`   | JSON Schemas, TypeScript types and fixtures every pole uses. See [packages/shared/README.md](../packages/shared/README.md).                                                                                                               |

## Source classes

| Class | What                                         | How it enters the vault                                                           |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| A     | Imported document, declared by the holder    | `/api/import/extract`: the LLM reads only the consented attributes                |
| B     | Document whose signature the server verified | Same route, when the PDF's PAdES signature passes against the trust anchors       |
| C     | Attestation signed by an organisation        | The issuer portal signs and anchors it; the holder imports the file it hands over |

Nothing turns A or B into C: only an issuer's EIP-712 signature, anchored on chain, makes class C.

## Flows

1. **Sign-in.** `GET /api/auth/nonce`, the wallet signs a SIWE message, `POST /api/auth/verify`
   checks it and sets an HMAC-signed session cookie (8 h). The nonce is spent on the first attempt.
2. **Vault.** The browser generates an RSA-OAEP key pair, registers the public key
   (`POST /api/vault/keys`), and encrypts each item itself before `POST /api/vault/items`. The
   server stores the bytes as they came and never holds a private key or an item key.
3. **Import (A, B).** The holder consents to a list of attributes (`POST /api/import/consent`),
   then uploads the document (`POST /api/import/extract`). The document is processed in memory and
   never stored; the consent is spent by that one run. The browser encrypts the returned claims.
4. **Issue (C).** An organisation registers in `IssuerRegistry`, signs an attestation (EIP-712,
   domain bound to the chain id and the `AttestationRegistry` address) and calls `anchor` with the
   salted commitment. The holder receives the record file (value and salt) and stores it encrypted.
5. **Share.** The requester, with no wallet or account, signs one `VerificationRequest` per piece
   of information (one purpose, at most 7 days) with a throwaway key made in its browser, and
   sends the holder the link. The holder chooses, piece by piece, an item to share or refuses. On
   allow, the holder's browser wraps the item key for the requester's public key and publishes
   the envelope.
6. **Verify.** The requester downloads the ciphertext and envelope, decrypts in its browser and runs
   `verify()`, which reads `getAnchor` from Base Sepolia itself and never trusts a Glimpse answer.
   The holder can withdraw consent; the issuer can revoke on chain.

## What goes on chain

Opaque ids, issuer signer, salted commitment
`keccak256(abi.encode(salt, attestationId, holder, attribute, valueType, valueJson))`, validity and
revocation times. Holder, attribute and value stay off chain.

## Testnet deployment

Base Sepolia (chain id 84532), deployed at block 55053387:

| Contract              | Address                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `IssuerRegistry`      | [0x07Ee362e4FFA3c6c21cBB41eb545FA45c16CF9ee](https://sepolia.basescan.org/address/0x07Ee362e4FFA3c6c21cBB41eb545FA45c16CF9ee) |
| `AttestationRegistry` | [0xE481E72D9aBe5B4a43405B2C58cAA972d0a6dDd6](https://sepolia.basescan.org/address/0xE481E72D9aBe5B4a43405B2C58cAA972d0a6dDd6) |

Source of truth: `contracts/ignition/deployments/chain-84532/deployed_addresses.json`.
