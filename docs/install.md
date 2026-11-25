# Install and run

## Requirements

- Node 24 or later, npm.
- A browser wallet (MetaMask or any injected EIP-1193 wallet) on Base Sepolia (chain id 84532).
  Issuing an attestation needs a little Base Sepolia ETH for gas; holding and verifying need none.
- Optional: [Ollama](https://ollama.com) with a local model, for real LLM extraction.

## Setup

```sh
npm ci
cp apps/web/.env.example apps/web/.env.local
openssl rand -base64 32   # paste it as SESSION_SECRET in apps/web/.env.local
npm run dev -w apps/web   # http://localhost:3000
```

## Environment (`apps/web/.env.local`)

| Variable                             | Default                                      | What                                                                                             |
| ------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `SESSION_SECRET`                     | none, required                               | HMAC key of the session cookies                                                                  |
| `PADES_TRUST_ANCHORS`                | unset: no PDF signature is trusted           | PEM bundle of accepted CAs. Demo only: `fixtures/identity/FAKE-test-ca.pem`                      |
| `OLLAMA_MODEL`                       | unset: offline synthetic extractor           | Local Ollama model for extraction. The synthetic extractor only accepts synthetic demo documents |
| `VAULT_DATA_DIR`                     | `apps/web/.vault-data`                       | Where the encrypted items are written                                                            |
| `NEXT_PUBLIC_ATTESTATION_REGISTRY`   | `0xE481E72D9aBe5B4a43405B2C58cAA972d0a6dDd6` | AttestationRegistry the issuer anchors in and the verifier reads                                 |
| `NEXT_PUBLIC_ISSUER_REGISTRY`        | `0x07Ee362e4FFA3c6c21cBB41eb545FA45c16CF9ee` | IssuerRegistry                                                                                   |
| `NEXT_PUBLIC_REGISTRIES_DEPLOYED_AT` | `55053387`                                   | Block the issuer portal's indexer starts from                                                    |
| `NEXT_PUBLIC_INDEX_RPC`              | `https://base-sepolia-rpc.publicnode.com`    | RPC for event indexing (`https://sepolia.base.org` caps `eth_getLogs` at 200 blocks)             |

## Demo documents

`apps/web/fixtures/identity/` holds FAKE test files: `FAKE-identity-proof.pdf` passes against
`FAKE-test-ca.pem`, `FAKE-identity-proof-wrong-signer.pdf` fails the chain check. Rebuild them with
`npm run fixtures:identity -w apps/web`. None of them is a real France Identité document.

## Checks

```sh
npm run lint && npm run format:check && npm test
```

`npm test` runs every workspace: web (typecheck and `node:test`), vault, verifier, shared, and the
contracts on a local Hardhat chain.

## Contracts

Already deployed on Base Sepolia: see [architecture.md](architecture.md#testnet-deployment). To
redeploy or run the on-chain demo, see [contracts/README.md](../contracts/README.md#commands).
