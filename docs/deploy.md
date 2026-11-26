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

| Variable                             | Value                                                        |
| ------------------------------------ | ------------------------------------------------------------ |
| `SESSION_SECRET`                     | `openssl rand -base64 32`, kept out of the repository        |
| `PADES_TRUST_ANCHORS`                | `fixtures/identity/FAKE-test-ca.pem` to demo the FAKE proofs |
| `VAULT_DATA_DIR`                     | `/tmp/glimpse-vault`, already set by `vercel.json`           |
| `NEXT_PUBLIC_ATTESTATION_REGISTRY`   | only to point at another deployment of the contracts         |
| `NEXT_PUBLIC_ISSUER_REGISTRY`        | idem                                                         |
| `NEXT_PUBLIC_REGISTRIES_DEPLOYED_AT` | idem                                                         |
| `NEXT_PUBLIC_INDEX_RPC`              | idem                                                         |

`OLLAMA_MODEL` stays unset: a hosted function reaches no local model, so extraction uses the
offline synthetic extractor, which only accepts the synthetic demo documents.

Pick one region (Settings → Functions), ideally Paris (`cdg1`). The reason is below.

### What a hosted deployment does not keep

The server holds the holders' registered public keys, the verification requests, the decisions, the
extraction consents and the identity reports **in the process**, and writes the encrypted items and
the share grants to `VAULT_DATA_DIR`. On Vercel each request is served by a function instance, every
instance has its own memory and its own `/tmp`, and both are dropped when the instance goes away.

So, on a Vercel deployment:

- Run one journey end to end in one sitting. A pause long enough for the instance to be recycled
  loses the requests and the items created before it.
- The holder's keys never left the browser anyway, and reloading the page drops them: that part
  behaves the same hosted or local.
- Nothing on chain is affected. Issuing, revoking and verifying read and write Base Sepolia
  directly, so an anchored attestation and its verdict survive everything above.

A single region makes an instance more likely to be reused between two requests of the same demo.

To keep server state across instances and restarts, the stores behind `HolderRegistry`,
`RequestStore`, `ExtractionConsentStore` and the identity reports have to move to a shared
database, and `VAULT_DATA_DIR` to object storage or a volume. That is the one thing between this
deployment and a durable one; it is listed in [limits.md](limits.md).

### Verify the deployment

```sh
curl -i https://<project>.vercel.app/api/auth/nonce   # 200 and a nonce
curl -i https://<project>.vercel.app/verify           # 307 to /login when signed out
```

Then sign in with a wallet on Base Sepolia and walk one import, one request and one verification.

## Mirror to the Epitech repository

The hand-in has to sit in the school's repository too.
[`.github/workflows/mirror.yml`](../.github/workflows/mirror.yml) pushes every branch and tag to it
on each push to `main`, and can be run by hand from the Actions tab. It stays skipped until both
settings below exist, so it never fails for want of them.

1. Generate a key pair whose private half only GitHub Actions holds:

   ```sh
   ssh-keygen -t ed25519 -C "glimpse-mirror" -f glimpse-mirror -N ""
   ```

2. In the **Epitech** repository: Settings → Deploy keys → Add deploy key, paste
   `glimpse-mirror.pub`, and tick **Allow write access**.
3. In **this** repository: Settings → Secrets and variables → Actions.
   - Secrets → New repository secret: `EPITECH_DEPLOY_KEY`, the contents of `glimpse-mirror`
     (the private key, including its `-----BEGIN`/`-----END` lines).
   - Variables → New repository variable: `EPITECH_REPOSITORY`, the SSH URL of the Epitech
     repository, for example `git@github.com:EpitechPGE5Innovation/glimpse.git`.
4. Delete the local `glimpse-mirror` key file. Never commit it.
5. Actions → Mirror → Run workflow, and check it is green.

`git push --mirror` makes the Epitech repository match this one exactly: it also deletes refs there
that no longer exist here. That is what a mirror means; it is the point.

### By hand, without the workflow

```sh
git remote add epitech <ssh url of the Epitech repository>
git push --mirror epitech
```
