# AGENTS.md

Rules for everyone working on Glimpse, humans and AI agents alike.

## Project

Glimpse is an encrypted vault of personal attestations, controlled by its holder and anchored on a
blockchain. Organisations sign attestations, holders consent to share one attribute, requesters
verify it on their own. Full scope: the roadmap doc linked in `README.md`.

## Layout and ownership

| Path                 | What                                                                       | Pole |
| -------------------- | -------------------------------------------------------------------------- | ---- |
| `apps/web/`          | Web app: SIWE, France Identité check, import, consent, dashboard           | A    |
| `packages/vault/`    | LLM extraction, client-side encryption, encrypted storage, share envelopes | B    |
| `contracts/`         | Hardhat 3 + Solidity: issuer registry, attestations, revocation            | C    |
| `packages/verifier/` | Independent verification engine, indexer                                   | C    |
| `packages/shared/`   | JSON Schemas, TypeScript interfaces, fixtures used by every pole           | all  |

Work inside your pole's folders. A change in `packages/shared/` breaks the other poles: it goes in
its own PR, reviewed by the pole that consumes the type.

## Stack

- Node 24, npm workspaces, TypeScript in strict mode (extend `tsconfig.base.json`).
- Contracts: Hardhat 3, Solidity `^0.8.28`, viem. Tests in Solidity or `node:test`.
- Lint and format: ESLint (`eslint.config.js`), Prettier (`.prettierrc.json`), Solhint (`.solhint.json`).
  Do not disable a rule inline without a comment saying why.

## Workflow

- One issue, one branch: `<pole>/<issue number>-<slug>` (e.g. `c/12-issuer-registry`).
- PR to `main`, CI green, one review from someone outside your pole.
- Commit messages: imperative, say why, reference the issue (`Add revocation events (#14)`).
- Before you push: `npm run lint && npm run format:check && npm test`.
- Every contract function and every crypto function ships with its tests.
- English everywhere: code, comments, commits, issues, docs.

## Security rules (non-negotiable)

- Never commit a private key, seed, API key or `.env`. Testnet keys: `npx hardhat keystore set <NAME>`.
- Nothing in clear on chain: only opaque ids, salted commitments, references and statuses. No raw hash
  of a low-entropy attribute (age, postcode): it falls to a dictionary attack.
- The holder's private key never leaves the client. Sharing goes through a key envelope for the
  requester's public key.
- The LLM extracts and classifies, it never certifies. Keep the three source classes apart:
  (A) imported document, (B) document with a verified signature, (C) attestation signed by an
  organisation. Never turn A into C automatically.
- The verifier checks signature, provenance, integrity, validity, revocation and replay itself; it
  never trusts a plain answer from a Glimpse server.
- No secrets, keys or full ID documents in an LLM prompt.

## For AI agents

- Read this file and the issue before writing code; stay inside the issue's scope.
- Reuse what exists in the repo before writing a helper. Do not add a dependency for a few lines.
- Do not edit generated files (`contracts/artifacts/`, `contracts/cache/`, `contracts/types/`,
  `package-lock.json` by hand).
- Run the checks above before saying a task is done.
