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

- **Name matching reads the proof's text.** The holder's surname and given names come from the
  signed PDF's text streams (plain or Flate, standard fonts). A proof whose fonts hide the text
  gives no name and fails closed: it cannot be bound, so nothing can be imported. The server keeps
  keyed fingerprints of the name, in memory, never the name itself.
- **Identity is held in memory.** A restart forgets every verified identity, like the other
  server state: the holder checks their proof again.

## Keys and storage

- **Keys live in the browser.** The holder's encryption key pair and item list, and each
  requester's signing and encryption keys, are kept in that browser's IndexedDB; the private keys
  are non-extractable `CryptoKey`s and never leave it. Another browser, a private window or cleared
  site data cannot open them. Signing out deletes the holder's. The holder id they are tied to lives
  in server memory: after a restart the server issues a new one and the old items cannot be opened.
- **Requests are anonymous.** Anyone can create one; the requester's name is declared, never
  verified, and the holder's screen says so. Memory is bounded (2,000 open requests).

- **No key backup or recovery.** Keys kept in one browser cannot be moved to another.
- **Server state is in memory.** Holders' registered public keys, verification requests, decisions,
  extraction consents and identity reports are lost when the server restarts. Only the encrypted
  items and the shares' grants, key envelopes and revocation markers are written to disk
  (`VAULT_DATA_DIR`).
- **Single server.** The stores are per process: running several instances behind a load balancer
  would split them. The hosted deployment is exactly that case — each function instance has its own
  memory and its own `/tmp` — so a journey has to be run in one sitting. See
  [deploy.md](deploy.md#what-a-hosted-deployment-does-not-keep).
- **The durable store is POSIX only.** It opens with `O_NOFOLLOW`, publishes with a hard link and
  keeps its directories private by mode. It refuses to start where those are missing rather than
  dropping them, and the app then holds the ciphertext in the server's memory, which writes nothing
  at all but does not survive a restart. `VAULT_STORAGE` forces either one.
- **Reading a PDF needs poppler.** `pdfinfo`, `pdftotext` and `pdftoppm` turn an uploaded PDF into
  text, and `tesseract` reads a scanned one. A host without them takes the text documents only, so
  the hosted demo imports as class A; a signed PDF, and with it class B, needs a machine that has
  them.

## Chain

- **Testnet only.** Contracts are on Base Sepolia, not audited, and not upgradeable.
- **No reorg handling.** The issuer portal's event index reads logs without waiting for
  confirmations and never rewinds; a reorg can leave a stale entry in the issuer's list. The
  requester's verdict is not affected: `verify()` reads `getAnchor` directly.
- **Public RPCs.** Indexing and verification go through public endpoints, which rate-limit and can
  be down; the verifier then reports the chain as unreachable and lets the requester retry.

## Product

- **Up to 8 pieces per request**, at most 7 days of validity, and no selective disclosure or
  zero-knowledge proof: the requester sees each shared value itself.
- **No demo video in the repo.** Signing with a wallet needs a person at the browser; the video is
  recorded by the team.
