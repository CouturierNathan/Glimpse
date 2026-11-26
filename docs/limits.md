# Known limits

What this prototype does not do, on purpose or for lack of time.

## Trust

- **No real France Identité CA.** The PAdES check works against whatever `PADES_TRUST_ANCHORS`
  names; the repo only ships a FAKE test CA. There is no OCSP or CRL lookup and no trusted
  timestamp check, so a revoked signing certificate still passes.
- **No issuer trust list.** `IssuerRegistry` registration is open, and the requester's verifier
  runs with an empty `trustedIssuers`: a verdict proves who signed, never that the signer is a
  legitimate organisation (`issuerTrusted` is always `false`).
- **The LLM is not a certifier.** Extracted attributes stay class A (or B with a verified
  signature); the extractor's output is checked against the document but can still miss or
  misread a field.

## Keys and storage

- **Holder keys live in browser memory only.** Reloading the page drops them, and with them access
  to the vault items they encrypted. There is no key backup or recovery.
- **Server state is in memory.** Holders' registered public keys, verification requests, decisions,
  extraction consents and identity reports are lost when the server restarts. Only the encrypted
  items and the shares' grants, key envelopes and revocation markers are written to disk
  (`VAULT_DATA_DIR`).
- **Single server.** The stores are per process: running several instances behind a load balancer
  would split them. The hosted deployment is exactly that case — each function instance has its own
  memory and its own `/tmp` — so a journey has to be run in one sitting. See
  [deploy.md](deploy.md#what-a-hosted-deployment-does-not-keep).
- **POSIX only.** The encrypted store opens with `O_NOFOLLOW`, publishes with a hard link and keeps
  its directories private by mode. It refuses to start where those are missing rather than dropping
  them, so the app runs on Linux and macOS, and on Windows through WSL.

## Chain

- **Testnet only.** Contracts are on Base Sepolia, not audited, and not upgradeable.
- **No reorg handling.** The issuer portal's event index reads logs without waiting for
  confirmations and never rewinds; a reorg can leave a stale entry in the issuer's list. The
  requester's verdict is not affected: `verify()` reads `getAnchor` directly.
- **Public RPCs.** Indexing and verification go through public endpoints, which rate-limit and can
  be down; the verifier then reports the chain as unreachable and lets the requester retry.

## Product

- **One attribute per request**, at most 1 h of validity, and no selective disclosure or
  zero-knowledge proof: the requester sees the shared value itself.
- **No demo video in the repo.** Signing with a wallet needs a person at the browser; the video is
  recorded by the team.
