# Encrypted off-chain storage — #9

This commit is stacked on #24, which depends on #23. Review/merge them in that order.
All storage changes live in `packages/vault`; A's handlers are unchanged.

## Choice and API

The demo uses **local object storage on a persistent filesystem**, not IPFS or a
cloud service. `createFileStorageBackend` persists encrypted JSON objects across
adapter/process restarts. Use a persistent private POSIX volume (Linux/WSL for the
local demo); directory fsync, hard links and O_NOFOLLOW support are required.
Ephemeral/serverless deployment filesystems are not durable storage for this demo.

The default directory is `packages/vault/.vault-data`, ignored by the package's
`.gitignore`. Configure `createFileStorageBackend({ directory: absolutePath })`
from trusted server configuration only. Keep custom directories under the ignored
`.vault-data/` tree or outside the checkout; otherwise explicitly ignore them before
running the app. Never choose a directory or filename from a request body. The
storage directory is dedicated, mode 0700, accessible only to the service account;
existing permissive/symlink directories are rejected rather than silently reused.

Browser code imports `@glimpse/vault` for encryption only. Server code explicitly
imports `@glimpse/vault/server`. The browser export condition blocks server imports;
there are no server re-exports from the browser entry point. The memory adapter is
available only from `@glimpse/vault/server/testing`, is named `ForTests`, copies its
buffers and is not the local demo's storage solution.

`createVaultStorage({backend, authenticate, maxObjectBytes?})` exposes:

| Method                     | Result                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| `put({record, envelopes})` | New random 64-character lowercase hex reference                    |
| `get(reference)`           | Validated `{record, envelopes}` or `null` when absent/inaccessible |
| `delete(reference)`        | `true` when deleted, `false` when absent/inaccessible              |

The holder is deliberately absent from all three method arguments. `authenticate`
is a trusted, server-installed async resolver called on every operation. It must
return `{holderId, expiresAt, encryptionKeyIds}` from the verified session plus an
authenticated server registry, or `null`. Session expiry is checked again by the
service. This callback is a composition boundary, not authentication implemented
by this package: a callback that trusts request JSON defeats isolation.

## A integration after server-side SIWE validation

A already has `getSession()` in `apps/web/src/lib/auth/server.ts`, which checks its
signed, expiring session cookie. Do not copy that implementation into this package.
The following is an integration sketch for an A-owned server module, not a new
handler or a registry implementation shipped by B:

```ts
import { getSession } from '<A existing auth server module>'
import { createFileStorageBackend, createVaultStorage } from '@glimpse/vault/server'

const backend = createFileStorageBackend() // once per server, private persistent volume

// A provides this registry and persists wallet -> opaque holder/key registrations.
// The values must never be taken from body.holderId, headers or URL parameters.
export async function storageForRequest(registry) {
  return createVaultStorage({
    backend: await backend,
    authenticate: async () => {
      const session = await getSession()
      if (!session) return null
      const identity = await registry.findByVerifiedWallet(session.address, session.chainId)
      if (!identity) return null
      return {
        holderId: identity.holderId,
        encryptionKeyIds: identity.encryptionKeyIds,
        expiresAt: session.expiresAt,
      }
    },
  })
}
// In A's authenticated, body-size-limited server handler:
// const storage = await storageForRequest(registry)
// const reference = await storage.put(parsedBody) // exactly {record,envelopes}
// const item = await storage.get(validatedReference)
// const deleted = await storage.delete(validatedReference)
```

A must supply the stable opaque holder ID to the browser before
`generateEncryptionKeys(holderId)` and register the resulting recipientKeyId/public
key via an authenticated flow. The registry must preserve legitimate historical
key IDs needed to open existing items, with any future key revocation policy made
explicit. An Ethereum address, its raw hash or a user-selected body field is not a
storage holder ID. No wallet address is written to this object store.

Enforce request body limits while reading the HTTP body, before JSON.parse; the
service's default 256 KiB object limit is a second boundary, not a streaming HTTP
parser. At most eight unique envelopes are accepted and each must match the
record's item ID/version/key ID, authenticated holder ID and registered encryption
key IDs. Only holder envelopes are supported here. Requester delivery, accepted
AccessDecision, grant expiry/revocation and third-party envelope authorization
belong to #10 and must not be bypassed with client-supplied `authorized: true`.

A must keep its cookie/CSRF/origin policy, avoid shared response caching and apply
request/holder rate limits and aggregate quotas before exposing routes. Suggested
HTTP mappings: UNAUTHENTICATED -> 401, FORBIDDEN -> 403, INVALID_INPUT -> 400,
TOO_LARGE -> 413, missing/inaccessible -> 404, CORRUPT -> 502, UNAVAILABLE -> 503.
Do not expose filesystem paths, registry details, payloads, cookies or keys in
errors/logs. Resolver/backend failures are reduced to stable storage error codes.
The package neither uploads data nor sends keys to any server.

## Persistence, integrity and C's anchor

The physical layout is `<private-root>/<opaque-holder>/<random-reference>.json`.
Only `{storageVersion:1, record, envelopes}` is written. Shared runtime schemas
reject additional plaintext metadata. Original filenames, claims, names, addresses,
keys, wallet signatures and identity mappings are not persisted here. The reference
is a fresh 256-bit CSPRNG value, independent of filenames, attributes, values and
ciphertext. The same payload stored twice receives different references.

C may anchor `0x${reference}` as bytes32, or the bare opaque string if its eventual
contract uses strings. No personal value, wallet/holder namespace or local path is
included in that reference. This is a locator, not a content hash, signature or
availability guarantee. C still defines its signed record/commitment and on-chain
interface. An anchor does not bypass authenticated holder lookup or establish
that C's real chain integration has been exercised by these local tests.

Writes use private exclusive temporary files, complete write + file fsync, atomic
create-without-overwrite via same-directory hard link, temporary-file cleanup and
directory fsync. Random-reference collisions never overwrite existing objects.
Deletion unlinks the holder's regular object and fsyncs its directory. Existing
symlink paths, symlink object files and multiply-linked files are rejected; IDs
and references have strict fixed hex grammars so no path traversal is accepted.
The root and holder directories must not be writable by another OS principal.
This does not claim protection against a machine administrator or malicious code
running as the same service account; Node lacks a portable openat-based directory
capability API. A crash may leave a private `.pending-*` orphan, never a partially
published JSON object; operational cleanup must remove such orphans only when no
writer is active. Multi-host distributed storage is outside this local adapter.

Reads are capped before allocation/JSON parsing, including a max+1 bounded read if
a file grows after stat. Missing objects and another holder's objects look the
same. Invalid UTF-8/JSON/schema/version, oversized files and mismatched envelope
metadata produce CORRUPT. Structurally valid ciphertext bit flips cannot be
cryptographically verified by the server, which has no decryption key: the browser
must use `decryptItem` with trusted expected context and reject GCM/OAEP failures.
No plaintext is returned after such failure. Encryption also does not prove issuer
authenticity; independent attestation verification remains required.

The storage is durable, but #8's private demo keys still exist only in client memory.
A page reload loses them; persistent ciphertext does not provide key recovery.
Deletion does not erase previously downloaded copies or an on-chain reference.

## Tests

Tests exercise both adapters, file re-opening, real client encryption/decryption,
wrong holders, session expiry, forged owner fields, unregistered envelope keys,
missing references, size limits, malformed and cryptographically altered data,
concurrent puts, non-overwrite collisions, file permissions, traversal, symlinks,
hard links, private buffer copies and the browser/server export boundary.

Run root `npm run lint && npm run format:check && npm test`.

## Final review: exact bytes and client-side integrity

Prefer packEncryptedItem -> putBytes -> getBytes -> verifyEncryptedItem for browser
integration. The byte endpoints enforce the same holder/schema/size policy but persist
exact upload bytes without JSON reserialization. The pack result's SHA-256 digest is
kept independently by the client, separate from the randomly generated opaque locator.
Changing even whitespace changes that pin. A compromised storage service cannot supply
a new pin in the same response and have it treated as trusted. High-level decryption
also requires the original recordDigest returned by client-side encryption.
The legacy object put/get API remains useful server-side, but is not an origin-authentication
mechanism. C's current registry anchors the signed attestation's salted commitment, NOT
the random storage reference or a storage-byte digest; no live storage anchoring is claimed.
FORBIDDEN is preserved when a previously registered encryption key is removed, instead
of incorrectly reporting corruption. A should retain authorized historical key IDs.
