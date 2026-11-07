import { type DocumentUploadRequest, parseContract } from '@glimpse/shared'

/** Attributes the import screen can extract. Shared by the browser form and the server. */
export interface ImportAttribute {
  attribute: string
  /** The label the extractor looks for in the document, e.g. `Student: true`. */
  label: string
  type: 'string' | 'number' | 'boolean' | 'date'
  /** What the holder reads on screen. */
  name: string
}

export const importAttributes: readonly ImportAttribute[] = [
  { attribute: 'student_status', label: 'Student', type: 'boolean', name: 'Student status' },
  { attribute: 'exam_score', label: 'Score', type: 'number', name: 'Exam score' },
]

/** Identity documents are refused by the extraction service: they never reach the model. */
export const documentKinds = [
  { kind: 'synthetic', name: 'Synthetic demo document' },
  { kind: 'education', name: 'Education certificate' },
  { kind: 'employment', name: 'Employment certificate' },
] as const

export type DocumentKind = (typeof documentKinds)[number]['kind']

export function attributeName(attribute: string): string {
  return importAttributes.find((a) => a.attribute === attribute)?.name ?? attribute
}

/** The media type the upload is read as: a PDF by type or extension, UTF-8 text otherwise. */
export function uploadMediaType(file: {
  type: string
  name: string
}): DocumentUploadRequest['mediaType'] {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    ? 'application/pdf'
    : 'text/plain'
}

/** An upload request naming only attributes this app can extract, or `null`. */
export function readUploadRequest(input: unknown): DocumentUploadRequest | null {
  try {
    const upload = parseContract('DocumentUploadRequest', input)
    const known = new Set(importAttributes.map((a) => a.attribute))
    return upload.attributes.every((a) => known.has(a)) ? upload : null
  } catch {
    return null
  }
}
