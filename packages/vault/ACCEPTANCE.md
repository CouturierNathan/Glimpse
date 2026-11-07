# Pole B — consolidated review and defense

This branch is the single integration/review entry for the remaining B work from
#24 (client encryption), #25 (encrypted local storage), #32 (scoped requester sharing),
#33 (local PDF/OCR/LLM extraction) and #34 (privacy and demo). Shared B contracts in
#23 are already on main; C's shared types and signed fixtures are reused unchanged.

## What B implements

| Issue | Delivered module                                                                           | Evidence                                                               |
| ----- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| #7    | Versioned shared types, schemas and synthetic fixtures                                     | Shared compliance suite; already merged                                |
| #8    | Per-item AES-GCM-256, fresh IV, independent RSA-OAEP holder identity                       | Real Web Crypto wrong-key/tamper tests                                 |
| #9    | Owner-isolated persistent local files, opaque locators, bounded exact-byte reads/writes    | Reopened adapter, permissions/path/corruption tests                    |
| #10   | Accepted-consent adapter, scoped requester envelope, replay, expiry and durable revocation | Only the granted item decrypts; other recipient/item rejected          |
| #11   | Local model, real PDF text/OCR, source-A grounded typed claims                             | Real Poppler/Tesseract, adversarial outputs and live Ollama acceptance |
| #12   | Scoped consent, minimal prompts, secret/identity blocking and purge                        | Success/failure/withdrawal cleanup tests                               |

## Final reviewer feedback addressed

- A legitimate-looking replacement encrypted using only the holder's public key is
  no longer sufficient to pass high-level decryption. The client retains the original
  SHA-256 recordDigest; decryptItem/decryptAttestation/wrapForRequester require it.
  A regression constructs the well-formed forgery and proves rejection, not just a
  malformed ciphertext rejection.
- packEncryptedItem / putBytes / getBytes / verifyEncryptedItem preserve and check
  the exact encrypted upload bytes. Keep that digest separately from the untrusted
  blob. The random storage locator remains random to preserve the agreed interface;
  it is deliberately not advertised as a content commitment.
- Removing an authorized encryption key yields FORBIDDEN, not a false CORRUPT.
- RSA modulus byte lengths round up. Holder envelope grantId remains an opaque
  owner-context reference for shared-v1 compatibility, never consent authorization.
- A's missing registry/session/consent wiring is specified as a concrete integration
  boundary, not represented as completed UI/HTTP code by this B package.

## Reproduce locally

Node 24 and Linux/WSL with Poppler + Tesseract (English data):

```sh
npm ci
npm run lint
npm run format:check
npm test
npm run demo --workspace @glimpse/vault
# Real local inference (separate Ollama installation):
# ollama pull qwen2.5:0.5b
npm run demo --workspace @glimpse/vault -- --ollama
```

The offline demo uses explicitly labelled synthetic extraction/session/consent
adapters, but real PDF parsing, crypto, persistent file reopening, sharing and
revocation. The real-model mode was manually run successfully using Ollama 0.40.15
and qwen2.5:0.5b on CPU with cloud disabled. Tests also recompute C's real fixture
commitment and recover its EIP-712 issuer signature. CI installs PDF/OCR binaries.

## Points to explain to the jury

The AI proposes a declaration, it does not certify it. B keeps A (import), B (verified
signature) and C (organisation attestation) distinct. A confidence score cannot
upgrade provenance. The vault encrypts each shareable attribute separately so a
requester receives a wrapped key for only that attribute. The server sees ciphertext
and opaque metadata, never private encryption keys or plaintext AES keys. AEAD binds
context; a separately trusted ciphertext fingerprint prevents storage substitution.
The chain verifies C's signed salted attestation commitment; it does not store the
personal value or currently anchor this package's random storage locator.

## Honest limits and cross-pole handoff

- A must wire existing SIWE into authenticated holder/key registration, readDecision
  and readConsent, provide the browser's trusted pins, and expose its own UI/routes.
  There is no permissive fallback and no authorization accepted from request JSON.
- C still performs independent issuer/signature/commitment/validity/revocation/replay
  checks against the live chain. B encrypting a C record does not certify it itself.
- Trusted pins must come from original client state or an independently authenticated
  holder/signature/commitment channel. A digest delivered by a malicious store beside
  its replacement data is not a trusted pin. This package does not invent a new
  shared signing protocol or claim initial origin authenticity for an unpinned blob.
- Private demo keys and their trusted pins live in memory. Reload loses decryption
  access; durable IndexedDB/recovery/backup is explicitly not implemented here.
- Revocation stops future service delivery; it cannot erase previously received
  keys/plaintext. JavaScript/OS memory cleanup is best effort, not forensic erasure.
- The local filesystem backend is not IPFS/cloud storage and requires a private
  persistent POSIX directory. The extraction grammar is conservative; ambiguous
  free-form prose/OCR requires holder review/correction instead of guessing.
