# Test documents

FAKE documents for the automated tests and for demonstrating Glimpse. They describe invented
people and are signed by a FAKE test authority. **None of them is a real identity document, and
`FAKE-test-ca.pem` is not a real trust anchor.**

A production build ignores the FAKE test CA even when `PADES_TRUST_ANCHORS` lists it, so these
files never count as a real identity there. A public demo deployment opts in explicitly with
`GLIMPSE_ALLOW_TEST_AUTHORITIES=1` (`apps/web/vercel.json` does).

## Files

| File                                     | Signature        | Person              | What it shows                                                      |
| ---------------------------------------- | ---------------- | ------------------- | ------------------------------------------------------------------ |
| `FAKE-test-ca.pem`                       | —                | —                   | The FAKE test CA. Point `PADES_TRUST_ANCHORS` at it for a demo     |
| `FAKE-identity-proof.pdf`                | valid            | Camille SYNTHETIQUE | France Identité proof that passes and binds                        |
| `FAKE-identity-proof-other-person.pdf`   | valid            | Jordan EXEMPLE      | Passes, but matches none of the documents below: imports refused   |
| `FAKE-identity-proof-wrong-signer.pdf`   | untrusted signer | Camille SYNTHETIQUE | Look-alike signer no trusted CA certifies: fails the chain check   |
| `FAKE-identity-proof-tampered.pdf`       | broken           | Camille → CAMILLA   | One letter changed after signing: fails the integrity check        |
| `FAKE-signed-synthetic-certificate.pdf`  | valid            | Camille SYNTHETIQUE | Student certificate, signed: imports as class B (needs poppler)    |
| `FAKE-signed-employment-certificate.pdf` | valid            | Camille SYNTHETIQUE | Employment certificate, signed: imports as class B (needs poppler) |
| `demo-complete-record.txt`               | none             | Camille SYNTHETIQUE | All 19 attributes; imports as class A on any machine               |
| `demo-student-certificate.txt`           | none             | Camille SYNTHETIQUE | Identity, address and education                                    |
| `demo-employment-certificate.txt`        | none             | Camille SYNTHETIQUE | Identity, job, contract and salary                                 |
| `demo-other-person-certificate.txt`      | none             | Jordan EXEMPLE      | Another person's document: refused for Camille's identity          |

## A demo journey

1. Set `PADES_TRUST_ANCHORS=../../tests/fixtures/documents/FAKE-test-ca.pem` in
   `apps/web/.env.local`, then `npm run dev -w apps/web`.
2. Sign in, open **Import** and check `FAKE-identity-proof.pdf`, then sign the binding: the
   identity is verified.
3. Import `demo-student-certificate.txt`: the name matches, the attributes reach the vault.
4. Import `demo-other-person-certificate.txt`: refused, the name does not match.
5. Check `FAKE-identity-proof-tampered.pdf` or `FAKE-identity-proof-wrong-signer.pdf`: refused.

## Integrity

The PDFs and the PEM are binary in `.gitattributes`: one converted byte breaks a signature. Do not
open and re-save them. The tests that read them:

- `apps/web/src/lib/identity/pades.test.ts`: signature, integrity, chain and validity checks.
- `apps/web/src/lib/identity/holder-name.test.ts`: the name each proof states.
- `apps/web/scripts/check-demo-documents.ts` (`npm run check:demo -w apps/web`): every text
  document goes through the real extractor.

Rebuild them all, with fresh keys, with `npm run fixtures:identity -w apps/web`. The keys are never
written: regenerating replaces every file, the CA included.
