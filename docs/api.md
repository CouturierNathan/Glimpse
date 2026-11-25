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

| Method and path                           | Auth   | Body                                                       | Who                                       | Success                                                                                         |
| ----------------------------------------- | ------ | ---------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `POST /api/requests`                      | holder | a signed `VerificationRequest`                             | requester                                 | `201 { requestId }`                                                                             |
| `GET /api/requests/{requestId}`           | holder |                                                            | anyone signed in with the link            | the request and `role` (`requester`, `holder`, `visitor`); a visitor sees `answered`, never how |
| `POST /api/requests/{requestId}/decision` | holder | `{ outcome: "deny" }` or `{ outcome: "allow", reference }` | the holder                                | `204` on deny; on allow `{ grant, recipient }` for the browser to wrap the item key             |
| `POST /api/requests/{requestId}/envelope` | holder | `{ envelope, expected }`                                   | the holder who allowed                    | `204`, the request becomes `shared`. `409` nothing to share                                     |
| `GET /api/requests/{requestId}/share`     | holder |                                                            | the requester only (`403` otherwise)      | the encrypted item, its envelope, the holder's pins and the request. `409` not shared yet       |
| `DELETE /api/requests/{requestId}/share`  | holder |                                                            | the holder who answered (`403` otherwise) | `204`: consent withdrawn, the requester can no longer download                                  |

`POST /api/requests` refuses a request not signed by the session's wallet, on another chain, for
an unknown attribute, with an empty purpose, living more than 1 h, or addressed to a key the
requester did not register. An unknown or malformed `requestId` is `404`.
