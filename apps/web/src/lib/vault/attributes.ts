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
