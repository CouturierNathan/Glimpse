# Client-side hybrid encryption

`@glimpse/vault` implements #8 on top of the shared v1 schemas from PR #23.
This branch is stacked on `b/7-data-schemas`; merge/review #23 first. No shared
contract is redefined or changed by the encryption commit.

## Browser usage

Use in a browser client module, event handler or worker, over HTTPS or localhost.
Never run these operations in a Next.js server action, API route or server component.
The source entry point needs a TypeScript-capable bundler (as does `@glimpse/shared`).
There are no Node imports, Buffer calls, wallet APIs or runtime dependencies beyond
`@glimpse/shared`. Typechecking runs both with Node test types and with DOM types only.

```ts
import { parseContract, fixtures } from '@glimpse/shared'
import {
  generateOpaqueId,
  generateEncryptionKeys,
  encryptItem,
  decryptItem,
  openEnvelope,
} from '@glimpse/vault'

// Create once for this in-memory session. This is NOT an Ethereum signing identity.
const holder = await generateEncryptionKeys(generateOpaqueId())
const claim = parseContract('ExtractedClaim', fixtures.valid.ExtractedClaim)
// Demo fixture only. In production, obtain this from the trusted upload/verifier,
// independently of AI output. Class B/C evidence must first be verified by A/C.
const trustedSource = claim.document
const { record, envelope } = await encryptItem(claim, trustedSource, holder, {
  itemId: generateOpaqueId(),
  itemVersion: 1,
  grantId: generateOpaqueId(),
})
// Capture at creation; retain/retrieve through authenticated application state.
// Do not construct expected context from an untrusted download in production.
const expected = {
  itemId: record.itemId,
  itemVersion: record.itemVersion,
  keyId: record.keyId,
  sourceClass: record.sourceClass,
  grantId: envelope.grantId,
}
// Only JSON.stringify({ record, envelope }) is eligible for server storage.
// holder, claim, trustedSource and returned plaintext stay on the client.
const plaintext = await decryptItem(record, envelope, holder, expected)
// Optional lower-level operation: yields a non-exportable decrypt-only CryptoKey.
const itemKey = await openEnvelope(envelope, holder, expected)
```

Keep `holder`, `expected` and decrypted content in component/session memory; do not
serialize them to localStorage, sessionStorage, analytics, logs or server state.
Public recipient key material can be exported as standard SPKI using
`crypto.subtle.exportKey('spki', holder.publicKey)`; an authenticated recipient key
registry must bind that key to recipientId/recipientKeyId before it is used.
No such registry or import/persistence service is implemented here. A holder's
initial envelope uses an opaque grantId reference for the shared wire format;
this does not issue a ShareGrant, authorize a third-party share or assert consent.

## Standard cryptographic profile

- Generate an independent RSA-OAEP 3072-bit keypair using Web Crypto with SHA-256,
  public exponent 65537 and a non-exportable private key. It is never derived from
  an Ethereum signature, private key, password, API key or fixed seed. Compatible
  RSA-OAEP-SHA-256 keys >=2048 bits are accepted; private keys must be non-exportable.
- Generate a new random AES-GCM 256-bit key per `encryptItem` call (one attribute),
  and a fresh random 96-bit IV. The API never accepts caller-supplied AES keys/IVs,
  so the API cannot accidentally reuse them. AES-GCM uses a 128-bit appended tag.
- Wrap the item key with standard `subtle.wrapKey('raw', ..., 'RSA-OAEP')` for the
  holder public key. The AES key is temporarily extractable solely to allow wrapping;
  it never leaves the function as raw key material or as an encrypt-capable handle.
- Use the exact shared `recordAdditionalData` as GCM additionalData, and shared
  `envelopeLabel` as RSA-OAEP label. These standard parameters bind IDs, item version,
  key ID, source class (record), recipient/key ID and grant ID (envelope), with
  domain/version separation. No custom encryption primitive or KDF is introduced.
- `openEnvelope` validates recipient and expected item/version/key/grant context,
  verifies RSA ciphertext length against the modulus and unwraps a non-exportable,
  decrypt-only 256-bit AES key. OAEP/GCM authentication failures are real Web Crypto
  rejections; there is no fallback key, retry algorithm or unauthenticated plaintext.
- All incoming wire objects use shared runtime validation. Bytes are canonical
  unpadded base64url; claims use JSON + UTF-8. Decrypted data is decoded strictly,
  validated and checked against the authenticated source class before return.
  Parse errors do not include decrypted payload snippets.

Callers must treat published item versions as immutable and advance the version on
replacement. A fresh encrypt call always creates a new key ID/envelope even if the
caller repeats an item/version. Confidentiality does not prove who encrypted a
payload: signatures and attestation verification still belong to A/C. Provenance
references are preserved, not certified by this module. Never trust AI-provided
source context or use encryption as an automatic A-to-B/C promotion.

## Demo key lifecycle and remaining integration

**Reloading or closing the page loses the private encryption key and the ability to
open existing demo envelopes. No durable recovery, backup, rotation, wallet-based
recovery or cross-device synchronization is implemented.** A new keypair after reload
does not recover the old one. Losing the in-memory key means losing access to that
ciphertext. This is an explicit demo limitation, not a production key solution.

Only encrypted wire objects are intended for future server storage. The module does
not log, write storage, make network calls or accept Ethereum signing keys. JavaScript
cannot guarantee erasure of strings or CryptoKey memory; temporary plaintext byte
buffers are cleared in finally blocks and key references become garbage-collectable.
Same-origin malicious code/XSS can still use keys or capture plaintext while the
session is open. Non-exportability is not an XSS defense.

Authorization, consent lifetime/revocation, replay prevention, authenticated key
lookup and recipient identity binding remain application integrations. This module
never treats envelope possession as permission to release data. Revocation cannot
erase a key/plaintext already delivered. Class C round trips are covered with a
synthetic attestation reference; C's actual signed AttestationRecord/fixture is not
published on the base branch, so independent signature verification and the final
C-provided attestation demo remain integration work, not claimed as complete here.

## Verification

Run root `npm ci`, `npm run lint`, `npm run format:check`, and `npm test`.
Tests use real Web Crypto, with no crypto mocks: JSON wire round trips, fresh keys
and IVs, wrong recipient including spoofed labels, ciphertext/tag/IV tampering,
changed authenticated context, wrapped-key corruption, AES key length, provenance,
malformed authenticated plaintext, and non-exportability. Browser DOM-only typechecking
checks the client module without Node ambient types; cryptographic execution tests
run on Node 24's Web Crypto implementation, not a browser automation suite.

## Server storage

The separate Node-only `@glimpse/vault/server` entry provides authenticated local
object storage. See [STORAGE.md](./STORAGE.md) for configuration, A's SIWE integration
boundary, C's opaque anchor reference and failure semantics. Never import this
entry from browser components. The original encryption API remains browser-only
in its intended use; storage does not provide durable private-key recovery.
