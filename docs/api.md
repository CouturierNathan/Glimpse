# API

The Next.js routes under `apps/web/src/app/api`. All bodies are JSON unless noted. Errors come back
as `{ "error": "<message>", "code"?: "<CODE>" }` with the HTTP status below; an unexpected error
never echoes its internals. Responses that carry holder data are `Cache-Control: no-store`.

**Auth** column:

- **none**: no session needed.
- **session**: a valid session cookie, else `401 SIGNED_OUT`.
- **holder**: a session plus a registered vault key for this wallet, else `401 SIGNED_OUT` or
  `409 VAULT_LOCKED`.

## Sign-in (SIWE)

| Method and path         | Auth | Body                     | Success                                                                                         |
| ----------------------- | ---- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| `GET /api/auth/nonce`   | none |                          | `{ nonce }`, and a nonce cookie valid 10 min                                                    |
| `POST /api/auth/verify` | none | `{ message, signature }` | `{ address }` and the session cookie (8 h). `400` malformed, `401` spent nonce or bad signature |
| `GET /api/auth/session` | none |                          | `{ address }`, `null` when signed out                                                           |
| `POST /api/auth/logout` | none |                          | `204`, session cookie deleted                                                                   |

The SIWE message must name this host and origin, the app chain (Base Sepolia, 84532) and the
nonce from this browser's cookie. The nonce is spent on the first attempt, whatever its outcome.

## Vault

| Method and path                       | Auth    | Body                            | Success                                                                                                          |
| ------------------------------------- | ------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /api/vault/holder`               | session |                                 | `{ holderId }`: the wallet's opaque holder id                                                                    |
| `POST /api/vault/keys`                | session | `{ recipientKeyId, publicKey }` | `204`. `publicKey` is base64url SPKI, RSA-OAEP SHA-256, 2048 bits or more. `400` bad key, `409` id already bound |
| `POST /api/vault/items`               | holder  | raw encrypted bytes             | `201 { reference }`                                                                                              |
| `GET /api/vault/items/{reference}`    | holder  |                                 | the encrypted bytes (`application/octet-stream`), `404` if not this holder's                                     |
| `DELETE /api/vault/items/{reference}` | holder  |                                 | `204`, `404` if not this holder's                                                                                |

The server stores items exactly as the browser packed them and cannot decrypt them.

## Identity and import

| Method and path             | Auth   | Body                                                         | Success                                                                                                                      |
| --------------------------- | ------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/identity/verify` | holder | multipart `file` (signed PDF, 5 MiB max)                     | `{ report, binding }`: the PAdES validation report, and the message to sign when it passed                                   |
| `POST /api/identity/bind`   | holder | `{ reportId, signature }`                                    | `{ address }`. The server rebuilds the message itself. `404` unknown report, `401` signature not from this wallet            |
| `POST /api/import/consent`  | holder | a `DocumentUploadRequest` (documentId, version, attributes)  | `204`: consent to read those attributes from that document                                                                   |
| `POST /api/import/extract`  | holder | multipart `request` (the `DocumentUploadRequest`) and `file` | `{ claims, source, report }`. Class A, or B when the PDF signature passed. `413` too many pages, `415` not PDF or UTF-8 text |

The document is read in memory and never stored. One consent covers one extraction run: it is
withdrawn when the run ends, success or failure.

## Verification requests

A request asks for one or more pieces of information. **Creating and reading one needs no account
and no wallet.** The requester's browser makes a throwaway signing key and an RSA-OAEP key pair,
kept in its IndexedDB: it signs one `VerificationRequest` per piece with the signing key (so the
verifier's own signature and replay checks hold) and receives the answers on the encryption key.
The link it shares is `/consent/{requestId}`, where `requestId` is the request (bundle) id; each
piece has its own id for the holder's answer.

| Method and path                         | Auth           | Body                                                       | Who                                       | Success                                                                                                                |
| --------------------------------------- | -------------- | ---------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `POST /api/requests`                    | none           | `{ bundleId, requesterName, publicKey, requests[] }`       | anyone                                    | `201 { requestId }`. `requests` are signed `VerificationRequest`s, 1 to 8, same key, purpose and lifetime              |
| `GET /api/requests/{requestId}`         | none, optional | (requester proof header)                                   | anyone with the link                      | `{ requesterName, purpose, expiresAt, role, status, items[] }`. A visitor sees `pending` / `answered` / `expired` only |
| `POST /api/requests/{pieceId}/decision` | holder         | `{ outcome: "deny" }` or `{ outcome: "allow", reference }` | the first holder to answer (`409` others) | `204` on deny; on allow `{ grant, recipient }` for the browser to wrap the item key                                    |
| `POST /api/requests/{pieceId}/envelope` | holder         | `{ envelope, expected }`                                   | the holder who allowed                    | `204`, the piece becomes `shared`. `409` nothing to share                                                              |
| `GET /api/requests/{pieceId}/share`     | requester      | (requester proof header)                                   | the requester only (`403` otherwise)      | the encrypted item, its envelope, the holder's pins and the request. `409` not shared yet                              |
| `DELETE /api/requests/{pieceId}/share`  | holder         |                                                            | the holder who answered (`403` otherwise) | `204`: consent withdrawn, the requester can no longer download                                                         |

The requester proof is the header `x-glimpse-requester: <ISO time>.<signature>`, an EIP-191
signature by the request's signing key over `Glimpse requester access / Request: {requestId} /
At: {time}`, accepted for five minutes. Nothing else identifies the requester; `requesterName` is
what they declared and the holder's screen says so.

`POST /api/requests` refuses pieces not all signed by the same key, on another chain, for an
unknown or repeated attribute, with an empty purpose, or living more than seven days. At most
2,000 requests are kept at once (`503` beyond); a request is forgotten a day after it expires. An
unknown or malformed id is `404`.
