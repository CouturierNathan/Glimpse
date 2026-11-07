import { extractClaims, ExtractionError } from './extraction.ts'
import type { ExtractionDocument, AttributeSpec, ExtractionModel } from './extraction.ts'
import { withPdfPages } from './pdf.ts'
import { assertHolderId, StorageError } from './storage.ts'
import type { AuthenticatedHolder } from './storage.ts'

export const EXTRACTION_POLICY_VERSION = '1'
export interface ExtractionConsent {
  holderId: string
  documentId: string
  documentVersion: number
  purpose: 'extract-attributes'
  policyVersion: '1'
  attributes: string[]
  granted: boolean
  expiresAt: number
}
const secrets =
  /-----BEGIN [^-]*(?:PRIVATE KEY|CERTIFICATE)-----|\b(?:api[_ -]?key|private[_ -]?key|seed phrase|mnemonic|password)\s*[:=]|\bsk-[A-Za-z0-9_-]{12,}|\b(?:0x)?[a-fA-F0-9]{64}\b|\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/i
const identity =
  /\b(?:passport|passeport|carte nationale d.identit[eé]|national identity card|social security number|num[eé]ro de s[eé]curit[eé] sociale)\b/i
/** Best-effort removal of model-output object references, not a secure JS heap erasure claim. */
function purge(value: unknown, seen = new Set<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  for (const key of Object.keys(value)) {
    const o = value as Record<string, unknown>
    purge(o[key], seen)
    Reflect.deleteProperty(o, key)
  }
  if (Array.isArray(value)) value.length = 0
}
export function createPrivateExtractionService(options: {
  authenticate: () => Promise<AuthenticatedHolder | null>
  /** Trusted server consent lookup; never accept this record in request JSON. */
  readConsent: (holderId: string, documentId: string) => Promise<ExtractionConsent | null>
  attributes: readonly AttributeSpec[]
  model: ExtractionModel
  temporaryRoot?: string
}) {
  const allowed = structuredClone(options.attributes)
  async function authorize(
    document: Pick<ExtractionDocument, 'documentId' | 'documentVersion' | 'kind'>,
    names: string[],
  ) {
    const h = await options.authenticate()
    if (!h || !Number.isSafeInteger(h.expiresAt) || h.expiresAt <= Date.now()) {
      throw new StorageError('UNAUTHENTICATED')
    }
    assertHolderId(h.holderId)
    assertHolderId(document.documentId)
    if (
      !Number.isSafeInteger(document.documentVersion) ||
      document.documentVersion < 1 ||
      !Array.isArray(names)
    ) {
      throw new ExtractionError()
    }
    const c = await options.readConsent(h.holderId, document.documentId)
    if (
      !c ||
      !c.granted ||
      c.holderId !== h.holderId ||
      c.documentId !== document.documentId ||
      c.documentVersion !== document.documentVersion ||
      c.purpose !== 'extract-attributes' ||
      c.policyVersion !== EXTRACTION_POLICY_VERSION ||
      !Number.isFinite(c.expiresAt) ||
      c.expiresAt <= Date.now() ||
      !Array.isArray(c.attributes) ||
      names.some((n) => !c.attributes.includes(n))
    ) {
      throw new StorageError('FORBIDDEN')
    }
    if (!names.length || new Set(names).size !== names.length) throw new ExtractionError()
    const specs = names.map((n) => {
      const spec = allowed.find((s) => s.attribute === n)
      if (!spec) throw new ExtractionError()
      return spec
    })
    if (
      document.kind === 'identity' ||
      (options.model.name === 'synthetic-fixture-demo' && document.kind !== 'synthetic') ||
      (!options.model.name.startsWith('ollama-local:') &&
        options.model.name !== 'synthetic-fixture-demo')
    ) {
      throw new ExtractionError()
    }
    return specs
  }
  async function run(input: ExtractionDocument, names: string[]) {
    if (
      !input ||
      !Array.isArray(input.pages) ||
      input.pages.length > 12 ||
      input.pages.some((p) => !p || typeof p.text !== 'string' || p.text.length > 40_000)
    ) {
      throw new ExtractionError()
    }
    const document = structuredClone(input)
    const outputs: unknown[] = []
    try {
      const specs = await authorize(document, names)
      for (const page of document.pages) {
        const normalized = page.text.normalize('NFKC')
        if (secrets.test(normalized) || identity.test(normalized)) throw new ExtractionError()
      }
      const model: ExtractionModel = {
        name: options.model.name,
        async complete(system, data) {
          await authorize(document, names)
          const result = await options.model.complete(system, data)
          outputs.push(result)
          return result
        },
      }
      const claims = await extractClaims(document, specs, model)
      await authorize(document, names) // withdrawal/expiry while inference was running
      return claims
    } catch (error) {
      if (error instanceof StorageError) throw error
      throw new ExtractionError()
    } finally {
      outputs.forEach((o) => purge(o))
      outputs.length = 0
      for (const page of document.pages) page.text = ''
      document.pages.length = 0
    }
  }
  return {
    extract: run,
    async extractPdf(
      input: Uint8Array,
      metadata: Omit<ExtractionDocument, 'pages'>,
      attributes: string[],
    ) {
      await authorize(metadata, attributes)
      if (input.byteLength > 5 * 1024 * 1024) throw new ExtractionError()
      const pdf = Uint8Array.from(input)
      try {
        return await withPdfPages(pdf, (pages) => run({ ...metadata, pages }, attributes), {
          temporaryRoot: options.temporaryRoot,
        })
      } finally {
        pdf.fill(0)
      }
    },
  }
}
