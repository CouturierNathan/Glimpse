import { createHmac } from 'node:crypto'
import { inflateSync } from 'node:zlib'

/*
 * The holder's name, read from a France Identité proof whose signature passed, and compared with
 * the name on each document the holder imports. The text sits inside the signed byte range, so a
 * passed signature vouches for it. The server keeps keyed fingerprints of the name tokens, never
 * the name itself.
 */

const MAX_STREAMS = 64
const MAX_TEXT_CHARS = 200_000

/** The text a literal PDF string encodes, with its escapes resolved. */
function literal(source: string, start: number): { text: string; end: number } {
  let depth = 0
  let text = ''
  for (let i = start; i < source.length; i++) {
    const c = source[i]
    if (c === '\\') {
      const next = source[++i] ?? ''
      const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '', f: '' }
      if (/[0-7]/.test(next)) {
        const octal = /^[0-7]{1,3}/.exec(source.slice(i))?.[0] ?? next
        text += String.fromCharCode(parseInt(octal, 8))
        i += octal.length - 1
      } else if (next === '\n' || next === '\r') {
        // A line continuation.
      } else {
        text += escapes[next] ?? next
      }
    } else if (c === '(') {
      if (depth++ > 0) text += c
    } else if (c === ')') {
      if (--depth === 0) return { text, end: i + 1 }
      text += c
    } else if (depth > 0) {
      text += c
    }
  }
  return { text, end: source.length }
}

/** The strings a content stream shows, one line per text-showing or line-moving operator. */
function contentLines(content: string): string[] {
  const lines: string[] = []
  let current = ''
  const flush = () => {
    if (current.trim()) lines.push(current.trim())
    current = ''
  }
  for (let i = 0; i < content.length;) {
    const c = content[i]
    if (c === '(') {
      const { text, end } = literal(content, i)
      current += text
      i = end
      continue
    }
    const op = /^(T\*|Td|TD|Tm|ET|'|")(?=[\s[(<]|$)/.exec(content.slice(i, i + 3))
    if (op && /\s/.test(content[i - 1] ?? ' ')) {
      // ' and " show their string first, then move: the string read before belongs to this line.
      flush()
      i += op[0].length
      continue
    }
    i++
  }
  flush()
  return lines
}

/**
 * The lines of text in a PDF's content streams, plain or Flate-compressed. Enough for the text a
 * proof writes with standard fonts; anything else reads as no text, and the name check then fails
 * closed.
 */
export function pdfTextLines(pdf: Uint8Array): string[] {
  const source = Buffer.from(pdf).toString('latin1')
  const lines: string[] = []
  let total = 0
  const streams = source.matchAll(/<<((?:(?!>>)[^])*)>>\s*stream\r?\n/g)
  let count = 0
  for (const match of streams) {
    if (++count > MAX_STREAMS || total > MAX_TEXT_CHARS) break
    const start = (match.index ?? 0) + match[0].length
    const end = source.indexOf('endstream', start)
    if (end < 0) break
    let bytes = Buffer.from(source.slice(start, end), 'latin1')
    if (/\/FlateDecode/.test(match[1] ?? '')) {
      try {
        bytes = inflateSync(bytes, { maxOutputLength: MAX_TEXT_CHARS })
      } catch {
        continue
      }
    }
    const content = bytes.toString('latin1')
    if (!/\bBT\b/.test(content)) continue
    for (const line of contentLines(content)) {
      total += line.length
      lines.push(line)
    }
  }
  return lines
}

/** Upper-case words without accents: `Élodie-Anne` and `ELODIE ANNE` read the same. */
export function nameTokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean)
}

export interface HolderName {
  surname: string[]
  givenNames: string[]
}

const SURNAME = /^\s*(?:surname|nom(?:\s+de\s+naissance)?|nom\s+d['’]usage)\s*:\s*(.+)$/i
const GIVEN = /^\s*(?:given\s+names?|pr[ée]noms?(?:\s*\(s\))?)\s*:\s*(.+)$/i

/** The surname and given names a proof states, or `null` when either is missing. */
export function readHolderName(lines: readonly string[]): HolderName | null {
  let surname: string[] = []
  let givenNames: string[] = []
  for (const line of lines) {
    const s = SURNAME.exec(line)
    if (s && surname.length === 0) surname = nameTokens(s[1] ?? '')
    const g = GIVEN.exec(line)
    if (g && givenNames.length === 0) givenNames = nameTokens(g[1] ?? '')
  }
  return surname.length > 0 && givenNames.length > 0 ? { surname, givenNames } : null
}

/** The same name with each token replaced by its keyed fingerprint. */
export function fingerprintName(name: HolderName, key: Uint8Array): HolderName {
  const hash = (token: string) => createHmac('sha256', key).update(token).digest('hex')
  return { surname: name.surname.map(hash), givenNames: name.givenNames.map(hash) }
}

/**
 * Whether a document's full name names the verified holder: every surname token and the first
 * given name appear, and no word is foreign to the verified name. Word order is free, since
 * documents write `NAME Given` as often as `Given NAME`. Both sides are fingerprinted with `key`.
 */
export function namesMatch(verified: HolderName, documentName: string, key: Uint8Array): boolean {
  const tokens = nameTokens(documentName)
  if (tokens.length === 0) return false
  const document = new Set(
    fingerprintName({ surname: tokens, givenNames: [] }, key).surname as string[],
  )
  const known = new Set([...verified.surname, ...verified.givenNames])
  const [first] = verified.givenNames
  return (
    first !== undefined &&
    document.has(first) &&
    verified.surname.every((token) => document.has(token)) &&
    [...document].every((token) => known.has(token))
  )
}
