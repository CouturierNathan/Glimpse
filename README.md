# Glimpse

**Reveal less. Prove more.**

Glimpse is an encrypted vault of personal attestations, controlled by its holder and anchored on a
blockchain. Two ways fill the vault: the holder imports a signed France Identité proof and documents
that an LLM turns into structured attributes, or an organisation signs an attestation about them. A
requester then asks for one precise attribute, the holder accepts or refuses, and the requester checks
signature, provenance, validity and revocation on their own.

Epitech PGE5, Blockchain & dApps (G-ING-910). Roadmap and architecture:
[BLOCKCHAIN - Glimpse](https://docs.google.com/document/d/1oOWQAtXLq1FSuMFGE98GP-v0v0WBKxi3ACZNPVeBoiM/edit).

## Team

| Pole                                 | Scope                                                              | Owner            |
| ------------------------------------ | ------------------------------------------------------------------ | ---------------- |
| A: product, identity, UI             | Web app, SIWE, France Identité / DSS, import, consent, dashboard   | Nathan Couturier |
| B: AI, data, applied crypto          | LLM extraction, encryption, encrypted storage, share envelopes     | Paul Bardeur     |
| C: blockchain, issuers, verification | Contracts, issuer registry, revocation, indexer, verifier, testnet | Marius Rousset   |

Tickets: [issues](https://github.com/paulbardeur/blockchain/issues), labelled `pole:A`, `pole:B`,
`pole:C` and `shared`, tracked on the [Glimpse board](https://github.com/users/anpawo/projects/4)
(fields Status, Pole, Phase, Milestone).

## Dates

- Mid-term defense: Sat 7 Nov 2026, 14:30
- Hand-in: Fri 27 Nov 2026, 23:42
- Final defense: Sat 28 Nov or Sat 5 Dec 2026 (slot to confirm on the intra)

## Layout

| Path                 | What                                           |
| -------------------- | ---------------------------------------------- |
| `apps/web/`          | Web app (pole A)                               |
| `packages/vault/`    | Extraction, encryption, storage (pole B)       |
| `contracts/`         | Solidity contracts, Hardhat 3 (pole C)         |
| `packages/verifier/` | Verification engine, indexer (pole C)          |
| `packages/shared/`   | Schemas, TypeScript interfaces, fixtures (all) |

Each folder is an npm workspace, created by the first issue that needs it.

## Getting started

Node 24 or later.

```sh
npm ci
npm run lint
npm run format:check
npm test
```

Working rules (branches, reviews, security): [AGENTS.md](AGENTS.md).

## Documentation

- [Install and run](docs/install.md)
- [Architecture and testnet deployment](docs/architecture.md)
- [API](docs/api.md)
- [Security tests](docs/security-tests.md)
- [Known limits](docs/limits.md)
