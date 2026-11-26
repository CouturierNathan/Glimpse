# Local extraction privacy policy — version 1 (#12)

## Deployment decision

Provider: an operator-controlled **local Ollama** runtime reached only at
`http://127.0.0.1:11434/api/chat`. No cloud URL, credentials, remote redirects or
silent remote fallback. Explicit cloud model tags are rejected. The operator must
install a genuinely local model, prevent cloud/remote forwarding and outbound model
traffic, and keep the runtime on the trusted host. This package cannot certify a
separately configured Ollama service or a model aliased by its operator.

Location: the machine running the local server/model. No geographic location is
inferred from localhost; the deployer documents the actual host location before
real personal data is processed. The offline demo uses only synthetic fixtures
and a clearly labelled deterministic model, not an LLM. Use `--ollama` to exercise
the real adapter after installing/pulling the chosen local model.

## Admission, consent and minimization

The public integration entry is `createPrivateExtractionService`, installed by A
with trusted `authenticate`, `readConsent`, a fixed allowlist of AttributeSpecs and
a server-selected model. It exposes `extract(document, requestedAttributeNames)`
and `extractPdf(pdfBytes, trustedDocumentMetadata, requestedAttributeNames)`.

A resolves holder identity from its verified SIWE session. Its consent lookup must
bind holder, assigned document ID/version, exact attributes, purpose
`extract-attributes`, policy version `1`, granted status and expiration. Do not accept
this record, a model URL, arbitrary label specifications or `authorized:true` from
request JSON. Missing, revoked, expired or mismatched consent fails before inference.
Consent is rechecked before the model call and after it returns: withdrawal during
inference prevents returning claims. A owns consent display, collection and durable
recordkeeping; this package does not implement A's handlers or impersonate consent.

The demo's processing basis is **synthetic data**, with no real data subject. For a
real deployment, the controller must document its applicable legal basis, purpose,
retention and information/withdrawal process before enabling real-data use. The
technical gate requires explicit scoped consent, but does not itself establish legal
compliance or claim consent is the appropriate legal basis in every setting. Do not
mix AI extraction consent with consent to share an attribute with a requester.

Only the unique allowlisted label line and its page/type/attribute are sent to the
model, at most 600 characters per attribute and eight attributes. Unrelated page
content, document/holder IDs, wallet data and the full PDF are absent from prompts.
Full identity documents are refused. Known identity-document markers, private keys,
API keys, passwords/seed labels, 32-byte hex secrets and IBANs are blocked before
inference, including NFKC-normalized text. These detectors are conservative defense
in depth, not a perfect classifier or redactor. A must still restrict input kinds,
provide bounded uploads and use human-reviewed attribute specifications.

Extraction yields declarations (source A), never automatic certification B/C.
Deterministic evidence/type/date/schema checks reject model fabrication. Human
review/correction is required before relying on a personal attribute or encrypting
and publishing it as the holder's declaration.

## Retention, logs and purge

| Data                        | Lifetime and handling                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| Source PDF/raster OCR files | Private 0700 random job directory, source 0600, removed in finally on success/failure/timeout          |
| Selected excerpts/prompts   | Function-scoped memory only; not written to disk or application logs                                   |
| Model response bytes        | Size bounded; byte buffers cleared on read/parse failure and completion                                |
| Parsed raw model outputs    | References recursively removed in finally after valid output, validation failure or consent withdrawal |
| Validated ExtractedClaim    | Returned to the authenticated caller for review and client encryption; not automatically persisted     |
| Encrypted items/grants      | Persisted only by the separate #9/#10 services; no plaintext claims or source documents                |
| Application logs            | No prompt, response, claim, PDF, wallet cookie, API credential, private key or raw AES logging         |

Exceptions use generic error messages without provider errors or snippets. Configure
reverse proxies, A's request logging, tracing and the separate Ollama runtime to
avoid body/prompt logging and unintended retention. `keep_alive:0` requests model
unloading, not secure erasure. Delete stale temporary job directories only when no
worker is active; abrupt OS termination can bypass finally. Encrypted object/grant
retention and tombstone cleanup need a deployment policy; do not erase replay
markers while a request ID could be reused. Source retention outside this module
is A's responsibility.

JavaScript strings, garbage collection, OS caches and third-party runtime buffers
cannot be reliably zeroized from this package. Reference removal and buffer clearing
are best effort, not a secure-heap erasure guarantee. Disk unlink is not a forensic
wipe. The policy makes no claim that private demo keys survive a browser reload.

## Reproducible demo and tests

Install Node 24; for scanned PDFs, Poppler's `pdftoppm` and Tesseract with English data. From repository root:

```sh
npm ci
npm run demo --workspace @glimpse/vault
# Real local model, explicitly selected; no automatic fallback:
# ollama pull qwen2.5:0.5b
npm run demo --workspace @glimpse/vault -- --ollama
npm run lint
npm run format:check
npm test
```

The offline command executes real PDF parsing, Web Crypto, persistent file storage
with a reopened adapter, scoped sharing, revoke rejection, and C fixture encryption.
It uses synthetic authenticated-session/consent adapters, not live SIWE. Its isolated
temporary object directory is removed afterwards. A real UI and chain anchoring are
owned by A/C; this command demonstrates B's complete local module flow, not those
external integrations. The test suite additionally verifies C's signature/commitment,
real OCR, evidence hallucination/injection rejection, denied consent, secret/identity
blocking, no unrelated prompt content, consent withdrawal and output/file purge.
An actual downloaded Ollama model is not part of automated tests; a real local HTTP
protocol server tests request/response bounds, redirects and errors deterministically.

Final acceptance also includes a manually executed real local Ollama 0.40.15 +
qwen2.5:0.5b run on the synthetic PDF, with cloud disabled. The complete B flow passed;
no real personal document was used. Automated tests remain provider-independent.
