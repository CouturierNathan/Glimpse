# Local extraction pipeline (#11)

The real provider adapter is Ollama's loopback-only POST /api/chat endpoint. No
cloud provider, API key, document-selected URL or remote fallback is used. Install
Ollama locally, pull an appropriate model (demo suggestion: `ollama pull qwen2.5:0.5b`),
then provide `createOllamaModel('qwen2.5:0.5b')` to the extraction service. The request
uses JSON output, temperature 0, no tools, no streaming, a 30-second deadline, a
64-KiB response cap, no redirects and keep_alive 0. This unload request is not a
claim that an external model runtime securely erases memory or disables its own logs.

Use the privacy-gated service described in PRIVACY.md for application integration;
`extractClaims` is the lower-level trusted-server pipeline, not an unauthenticated
HTTP endpoint. Never export it through an A handler without session and consent checks.

```ts
import { createOllamaModel, extractClaims } from '@glimpse/vault/server'
// Trusted import metadata and allowlisted attribute specifications, not model output.
const claims = await extractClaims(
  document,
  [{ attribute: 'student_status', label: 'Student', type: 'boolean' }],
  createOllamaModel('qwen2.5:0.5b'),
)
```

The conservative demo format is `Label: literal; period YYYY-MM-DD to YYYY-MM-DD`.
The model may identify facts only within selected label lines; each resulting value
is independently parsed from the exact quoted source, linked to that label/page,
and compared to the model output. Both dates must be explicitly present and valid.
Numbers use canonical decimal spelling; booleans are literal true/false. Strings
are copied literally. Unsupported free-form semantics, translation, uncertain OCR,
ambiguous duplicate labels, hallucinated values, fabricated evidence, unknown
fields and changed source classes fail closed. This deliberate restriction makes
correctable failures preferable to inventing an attribute for the demo. General
natural-language extraction needs additional deterministic normalizers and human
review; this implementation does not claim semantic verification of arbitrary prose.

All ExtractedClaim values are schema-validated and carry new random claim IDs,
trusted document ID/version, one-based pages, period, confidence and provenance A.
LLM confidence never certifies a document, and the LLM cannot supply B/C metadata.
Class B and C sources must use independently verified signature/attestation flows.
Known instruction-injection patterns are rejected before the provider call, document
text is always data under a fixed system policy, and every output is evidence checked.
Pattern detection is defense in depth, not a claim to detect every possible injection.

`withPdfPages(pdfBytes, callback)` reads real PDF text in process with pdf.js (through
`unpdf`, built for serverless hosts: no binary, no temporary file), and invokes Poppler
rasterization plus Tesseract only for empty scanned pages. Install `poppler-utils` and
`tesseract-ocr` (English OCR data) where scanned documents must be read. Files are private random
job directories, filenames are internal, subprocesses do not use a shell, timeouts
and output/page/pixel/input bounds apply, and all source/OCR files are purged in a
finally block. Limits: 5 MiB PDF, 12 pages, 40,000 characters/page, eight attributes,
600-character proof lines. Full identity documents are not supported or sent to a model.

`syntheticDemoModel()` is an explicitly named deterministic offline fixture adapter;
it is not an LLM and is never a silent fallback when Ollama fails. Synthetic text,
text-layer PDF and scanned PDF fixtures contain no real personal data. Tests run
real Poppler/Tesseract, adversarial output/injection cases, and a local HTTP protocol
server for the Ollama adapter. They do not claim a downloaded Ollama model was run.

## Manual real-model acceptance

The final consolidated branch was also exercised against an actual local Ollama
0.40.15 CPU runtime with qwen2.5:0.5b, cloud disabled, on the synthetic PDF. The entire
`demo -- --ollama` flow passed. That live check exposed an unconstrained-output issue:
the adapter now supplies a per-excerpt JSON Schema with grounded attribute/page/quote/
period constants and a constrained value type, while independent deterministic
validation still checks the proposed literal value and confidence. A successful real
model run is separate evidence from the deterministic automated HTTP protocol tests.
Model binaries/weights are not committed and must be installed by the demo operator.
