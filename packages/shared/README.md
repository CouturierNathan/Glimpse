# Shared data contracts — v1

B's contribution to #7 and #19. Node >=24; workspace consumers import from
`@glimpse/shared`. The package exports TypeScript source (Node type stripping;
TypeScript consumers must enable `allowImportingTsExtensions`, or bundle it).
No compilation step or runtime dependency is needed. `schemas/v1/*.schema.json`
and `fixtures/v1/{valid,invalid}.json` are exported subpaths. Fixtures are synthetic
wire-format examples, not decryptable cryptographic test vectors.

```ts
import { parseContract, fixtures, assertClaimProvenance } from '@glimpse/shared'
const claim = parseContract('ExtractedClaim', fixtures.valid.ExtractedClaim)
// source comes from trusted upload/signature/attestation verification, NOT the LLM.
assertClaimProvenance(claim, claim.document)
```

## Wire format and validation

All payloads carry `schemaVersion: "1.0.0"`; schema IDs and paths are immutable for
v1. Incompatible changes require a new major schema version. Unknown fields are
rejected recursively, including extra plaintext metadata. Schemas use JSON Schema
2020-12. A full validator must enable format assertions. `isContract` performs
structural validation only; `parseContract` additionally enforces chronology and
canonical base64url pad bits and returns a defensive copy. Run `parseContract` at
each untrusted boundary. Parse JSON before calling it; inputs must be JSON data.
Dates are real Gregorian `YYYY-MM-DD`; timestamps are exactly UTC
`YYYY-MM-DDTHH:mm:ss.sssZ`. Period bounds are inclusive, start <= end. Grants use
createdAt <= now < expiresAt and must be active, as independently checked by A.
Revocation cannot predate creation. Version numbers are positive safe integers.
Pages are unique, one-based; document page count must be checked by the importer.
Claim confidence is extraction confidence in [0,1], never certification.

Octets use canonical unpadded base64url, not UTF-8 ciphertext, hex or number arrays.
AES-256-GCM uses a fresh 96-bit IV for each encryption under a key and a 128-bit
tag appended to ciphertext. Never reuse an IV/key pair. `keyId` selects a random
32-byte item key; it is not that key. RSA-OAEP uses SHA-256 and MGF1-SHA-256, a
recipient RSA public key >=2048 bits, and wraps only the 32-byte item key.
The actual wrapped length must equal the registered recipient RSA modulus length;
that key-dependent check belongs to the unwrap implementation. Algorithm changes
need explicit new schemas, never silent fallback.

`recordAdditionalData(record)` yields the exact UTF-8 JSON array passed as AES-GCM
additionalData; `envelopeLabel(envelope)` yields the exact UTF-8 JSON array passed
as RSA-OAEP label. Domain tags, versions and ordered fields are fixed by the code;
no object-key canonicalization is required. Both operations must use these bytes
on encryption and decryption. Labels bind envelope ID, item ID/version, key ID,
recipient ID/key ID, grant ID and algorithm. Authenticate record context before
using plaintext; check `assertShareBinding` before unwrapping. The association
between recipientId and recipientKeyId must come from an authenticated key registry,
not untrusted envelope metadata. Versioned items and grant IDs are immutable;
re-encryption/key rotation creates a new version and requires new grants/envelopes.

## Provenance and privacy

- A = imported document; B = document with verified signature; C = organisation
  attestation. Extraction must preserve the exact trusted source class and evidence
  reference using `assertClaimProvenance`. The helper does not verify evidence itself.
- B requires a signatureVerificationId; C requires attestationId and issuerId. These
  opaque references do not establish trust without external verification.
- The entire ExtractedClaim (attribute, value, period, document and page references,
  confidence) is sensitive plaintext to encrypt, never storage metadata or chain data.
- Storage metadata has a closed allowlist of random, opaque 128-bit IDs, versions,
  cryptographic parameters, statuses and times. Never use names, email addresses,
  filenames, wallets, source URLs or hashes of low-entropy personal attributes as IDs.
  Regex validation cannot prove randomness or absence of encoded PII: generate IDs
  with a CSPRNG and enforce that policy at the producer.
- EncryptedRecord carries only sourceClass, not plaintext claims/evidence. Cryptographic
  authentication prevents class tampering after encryption, not dishonest producers.
- Sharing metadata belongs off chain. This package does not authorize publishing any
  object wholesale on chain. C must project only approved opaque references, salted
  commitments and statuses. Even opaque IDs and timing metadata require access control.
- Revocation stops future authorized key delivery; it cannot erase an already received
  key/plaintext. Structural validation and binding checks never replace authorization.

## Interfaces for A and C to review

Main at `8f7c9bc2204b49664ed3edc1b299f76a521d13df` has no shared A/C types.
A's existing `Session`, `SiweExpectation`, `SiweSignIn` remain local authentication
contracts; none is a data-sharing authorization or attestation record, so no
parallel definition is introduced here.

**A — AccessDecision is missing.** Expected contract to be published by A: an
explicit allow/deny result bound to authenticated holder/actor, item ID/version,
recipient ID, consentRequestId and grantId, decision time and stable denial reason.
Allow must require holder ownership, authenticated recipient/key association,
consent matching this exact item/version and recipient, current time within the
grant lifetime, no revocation and replay protection. Missing/invalid decisions
fail closed. B consumes this result before envelope creation or delivery; a
ShareGrant or successful `assertShareBinding` is never sufficient authorization.
A should review IDs/consent linkage, grant lifecycle and plaintext isolation.
These are contract requirements for review, not a competing AccessDecision type.

**C — AttestationRecord is missing.** Expected contract to be published by C:
versioned attestationId/issuerId, subject/holder binding and item/claim commitment,
issuer key/signature reference with algorithm and canonical signed payload,
issued/valid-from/valid-until times, chain/network/registry reference, and independently
checkable revocation reference/status. C must define exact commitment salting,
signature serialization and replay domain. B's class C reference must resolve to
that record and match issuer, document/claim binding, validity and revocation;
a class B signatureVerificationId must resolve to verified document signature
and signer evidence, not an LLM verdict. C should review provenance evidence,
opaque IDs, cryptographic context bytes and chain-safe projections.

Both poles must agree on the RSA recipient key registry and binding profile before
crypto integration; this PR defines wire contracts, not a key service or encryption
implementation. #19 remains open until all pole contracts and consumer reviews exist.
