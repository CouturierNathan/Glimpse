# Scoped sharing (#10)

1. A authenticates the holder using its existing SIWE session and verifies C's signed
   VerificationRequest, requested attribute/item, key registration, consent and ownership.
2. Install `createShareService({ backend, authenticate, readDecision })` on the server.
   `readDecision` maps A's trusted live AccessDecision to the documented ConsentDecision
   boundary. It is not a replacement shared AccessDecision type, and must never read an
   allow/holder/recipient flag from request JSON. Missing/denied decisions fail closed.
3. Holder calls `authorize(storageReference, consentRequestId)`. This atomically consumes
   the request once, creates a ShareGrant and returns an opaque shareReference.
4. On the holder's client call `wrapForRequester(record, ownerEnvelope, holderIdentity,
trustedOwnerExpectation, ticket.grant, registeredRequesterPublicRecipient)`. AES unwrap
   is transiently extractable only within that operation for standard RSA-OAEP wrapKey.
   No private key/raw AES key is returned or sent. The ciphertext is authenticated first.
5. Holder submits only the resulting KeyEnvelope to `publish(shareReference, envelope)`.
6. Authenticated requester calls `receive(shareReference)`, which rechecks the current
   decision, grant lifetime, revocation marker and registered recipient key on every read.
   The response contains exactly that encrypted record, recipient envelope and grant.
   Use decryptItem/decryptAttestation with the trusted expected context on the client.
7. Holder can `revoke(shareReference)`. Immutable revocation markers survive restarts.

Only server-installed adapters establish identity/consent. Do not expose the raw backend
or accept callbacks/identities from HTTP. The trusted A adapter owns verification of
request signatures, purpose display, issuer trust and any account/key registry. There is
no default permissive decision. The existing owner vault remains owner-only: recipient
reads use the share service and cannot enumerate/read other items or the owner's envelope.
Use the persistent file backend from #9 for both objects and share receipts. Internal
receipts and markers contain only opaque references/key IDs, versions, times and states.
Requests and grants are immutable; new consent requires a new random request ID. Markers
are deliberately not erased on revoke, to prevent replay. Old receipts need a retention
policy at deployment. The fixed internal namespace is public routing metadata, not a key.

Expiration/revocation block future service delivery, not an already delivered key or
plaintext. Revoke cannot cryptographically erase a requester's prior copies. This local
service is not a distributed transactional authorization store; enforce HTTPS, origin/CSRF,
body limits and rate limits in A's handlers. A's handlers and C's contracts are unchanged.

C's actual shared AttestationRecord and signed fixture are now reused via the explicit
browser encryptAttestation/decryptAttestation APIs. These preserve the complete signed
record inside ciphertext (source C) without changing shared contracts. Encryption is not
signature verification: C's verifier must still check its EIP-712 proof, commitment,
issuer, chain state and revocation. Tests independently recover C's fixture signer and
recompute its commitment using C's helpers before holder/requester encrypted round trips.
No test key is embedded by this package, and demo private encryption keys remain memory-only.
