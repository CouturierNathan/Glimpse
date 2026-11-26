# Deploy

Glimpse is one Next.js application: the pages and the API live in the same deployment, so hosting
it hosts both the front end and the back end. There is nothing else to run. The contracts are
already on Base Sepolia (see [architecture.md](architecture.md#testnet-deployment)) and the browser
talks to the chain itself.

## Vercel

### Create the project

1. On [vercel.com](https://vercel.com), **Add New → Project**, and import
   `paulbardeur/blockchain`.
2. Set **Root Directory** to `apps/web`. Leave **Include source files outside of the Root
   Directory** on: the app imports `packages/shared`, `packages/vault` and `packages/verifier` from
   the workspace.
3. Framework preset: Next.js. Build and install commands come from
   [`apps/web/vercel.json`](../apps/web/vercel.json); do not override them.
4. Node version: 24. `apps/web/package.json` asks for it through `engines`.

### Environment variables

Set these on the project, for Production and Preview. Only the first is required.

| Variable                               | Value                                                       |
| -------------------------------------- | ----------------------------------------------------------- |
| `SESSION_SECRET`                       | `openssl rand -base64 32`, kept out of the repository       |
| `PADES_TRUST_ANCHORS`                  | `../../tests/fixtures/documents/FAKE-test-ca.pem` (demo)    |
| `GLIMPSE_ALLOW_TEST_AUTHORITIES`       | `1`, already set by `vercel.json`, for the public demo only |
| `VAULT_DATA_DIR`                       | `/tmp/glimpse-vault`, already set by `vercel.json`          |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | set by the Upstash for Redis integration: shared state      |
| `VAULT_STORAGE`                        | `memory` to skip `/tmp` entirely; unset uses the file store |
| `NEXT_PUBLIC_ATTESTATION_REGISTRY`     | only to point at another deployment of the contracts        |
| `NEXT_PUBLIC_ISSUER_REGISTRY`          | idem                                                        |
| `NEXT_PUBLIC_REGISTRIES_DEPLOYED_AT`   | idem                                                        |
| `NEXT_PUBLIC_INDEX_RPC`                | idem                                                        |

`OLLAMA_MODEL` stays unset: a hosted function reaches no local model, so extraction uses the
offline synthetic extractor, which only accepts the synthetic demo documents.

The FAKE CA is traced into the functions (`outputFileTracingIncludes` in `next.config.ts`). A value
set before the test documents moved (`fixtures/identity/…` or `public/demo/…`) still resolves to
it. A production build ignores any FAKE test CA unless `GLIMPSE_ALLOW_TEST_AUTHORITIES=1`: drop it
from `vercel.json` for a deployment that must accept real France Identité proofs only.

PDFs are read in the function itself with pdf.js (through `unpdf`), so text documents, text PDFs
and signed PDFs (class B) all import on Vercel, like the identity check. Only a scanned PDF, which
needs OCR (poppler's `pdftoppm` and `tesseract`), is refused there.

Pick one region (Settings → Functions), ideally Paris (`cdg1`). The reason is below.

### Shared state: link a Redis store (required for a lasting deployment)

Every function instance has its own memory and its own `/tmp`. For the vault, the identities and
the requests to be the same on every instance and to survive redeploys, link a Redis store:
Vercel → Storage → **Upstash for Redis** (Marketplace), connected to this project for Production
and Preview. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN`), which the app picks up on the next deployment: the encrypted items,
the share grants and envelopes, the registered public keys, the identity checks, the consents, the
requests and the registry index then all live there. Nothing in it opens a vault: the private keys
stay in the browsers, and the store holds ciphertext, public keys, keyed fingerprints and requests.

Without it, a deployment still runs, one instance at a time: a recycled instance forgets what it
held, and the vault screen shows the temporary-storage notice. Nothing on chain is affected either
way.

Holder ids are derived from `SESSION_SECRET`: keep it the same across deployments, or every vault
gets a new holder id and the stored items can no longer be opened.

### Verify the deployment

```sh
curl -i https://<project>.vercel.app/api/auth/nonce   # 200 and a nonce
curl -i https://<project>.vercel.app/verify           # 307 to /login when signed out
```

Then sign in with a wallet on Base Sepolia and walk one import, one request and one verification.

## Mirrors

Two copies follow this repository: the school's repository (the hand-in) and a personal public
repository, which Vercel deploys from because it cannot reach this private one.
[`.github/workflows/mirror.yml`](../.github/workflows/mirror.yml) pushes every branch and tag to
each of them on every push to `main`, and can be run by hand from the Actions tab. A target stays
skipped until its two settings exist, so it never fails for want of them.

| Target   | Repository variable   | Secret                |
| -------- | --------------------- | --------------------- |
| Epitech  | `EPITECH_REPOSITORY`  | `EPITECH_DEPLOY_KEY`  |
| Personal | `PERSONAL_REPOSITORY` | `PERSONAL_DEPLOY_KEY` |

For each target:

1. Generate a key pair whose private half only GitHub Actions holds (one per target):

   ```sh
   ssh-keygen -t ed25519 -C "glimpse-mirror" -f glimpse-mirror -N ""
   ```

2. In the **target** repository: Settings → Deploy keys → Add deploy key, paste
   `glimpse-mirror.pub`, and tick **Allow write access**.
3. In **this** repository (admin rights needed): Settings → Secrets and variables → Actions.
   - Secrets → New repository secret: `<TARGET>_DEPLOY_KEY`, the contents of `glimpse-mirror`
     (the private key, including its `-----BEGIN`/`-----END` lines).
   - Variables → New repository variable: `<TARGET>_REPOSITORY`, the SSH URL of the target
     repository, for example `git@github.com:EpitechPGE5Innovation/glimpse.git`.
4. Delete the local key files. Never commit them.
5. Actions → Mirror → Run workflow, and check both jobs are green.

`git push --mirror` makes each target match this repository exactly: it also deletes refs there
that no longer exist here. That is what a mirror means; commit to this repository, never to a
mirror.

### By hand, without the workflow

```sh
git remote add epitech <ssh url of the Epitech repository>
git push --mirror epitech
```
