import { type DocumentUploadRequest, parseContract } from '@glimpse/shared'

/** Attributes the import screen can extract. Shared by the browser form and the server. */
export interface ImportAttribute {
  attribute: string
  /** The label the extractor looks for in the document, e.g. `Student: true`. */
  label: string
  type: 'string' | 'number' | 'boolean' | 'date'
  /** What the holder reads on screen. */
  name: string
  /** The group the import screen lists it under. */
  category: AttributeCategory
}

export const attributeCategories = [
  { category: 'identity', name: 'Identity' },
  { category: 'address', name: 'Address' },
  { category: 'education', name: 'Education' },
  { category: 'work', name: 'Work and income' },
] as const

export type AttributeCategory = (typeof attributeCategories)[number]['category']

/**
 * The extractor is literal: it reads one line per attribute, written
 * `<label>: <value>; period <start> to <end>`. A label is matched at the start of a line, so no
 * label may be another one followed by a colon — `Employed` and `Employer` are distinct, and both
 * are fine.
 */
export const importAttributes: readonly ImportAttribute[] = [
  {
    attribute: 'full_name',
    label: 'Name',
    type: 'string',
    name: 'Full name',
    category: 'identity',
  },
  // Written DD/MM/YYYY, not ISO: the extractor reads the two ISO dates on a line as the period
  // the value holds for, so an ISO value on the same line would be a third one and be refused.
  {
    attribute: 'date_of_birth',
    label: 'Date of birth',
    type: 'string',
    name: 'Date of birth',
    category: 'identity',
  },
  { attribute: 'age', label: 'Age', type: 'number', name: 'Age', category: 'identity' },
  {
    attribute: 'nationality',
    label: 'Nationality',
    type: 'string',
    name: 'Nationality',
    category: 'identity',
  },
  {
    attribute: 'over_18',
    label: 'Over 18',
    type: 'boolean',
    name: 'Over 18',
    category: 'identity',
  },
  {
    attribute: 'address',
    label: 'Address',
    type: 'string',
    name: 'Street address',
    category: 'address',
  },
  {
    attribute: 'postal_code',
    label: 'Postal code',
    type: 'string',
    name: 'Postal code',
    category: 'address',
  },
  { attribute: 'city', label: 'City', type: 'string', name: 'City', category: 'address' },
  { attribute: 'country', label: 'Country', type: 'string', name: 'Country', category: 'address' },
  {
    attribute: 'student_status',
    label: 'Student',
    type: 'boolean',
    name: 'Student status',
    category: 'education',
  },
  { attribute: 'school', label: 'School', type: 'string', name: 'School', category: 'education' },
  {
    attribute: 'study_level',
    label: 'Study level',
    type: 'string',
    name: 'Study level',
    category: 'education',
  },
  {
    attribute: 'exam_score',
    label: 'Score',
    type: 'number',
    name: 'Exam score',
    category: 'education',
  },
  {
    attribute: 'graduation_year',
    label: 'Graduation year',
    type: 'number',
    name: 'Graduation year',
    category: 'education',
  },
  {
    attribute: 'employment_status',
    label: 'Employed',
    type: 'boolean',
    name: 'Employment status',
    category: 'work',
  },
  { attribute: 'employer', label: 'Employer', type: 'string', name: 'Employer', category: 'work' },
  {
    attribute: 'job_title',
    label: 'Job title',
    type: 'string',
    name: 'Job title',
    category: 'work',
  },
  {
    attribute: 'contract_type',
    label: 'Contract type',
    type: 'string',
    name: 'Contract type',
    category: 'work',
  },
  {
    attribute: 'annual_salary',
    label: 'Annual salary',
    type: 'number',
    name: 'Annual salary (EUR)',
    category: 'work',
  },
]

/**
 * One run may ask for every piece of information the app knows: the screen ticks them all by
 * default, and a document that says nothing about one simply does not answer for it.
 */
export const MAX_ATTRIBUTES_PER_IMPORT = 19

/**
 * The kind every import declares. The holder no longer picks one: the extractor reads the same
 * labels whatever the document, and identity documents never go through it (they go through the
 * France Identité check), so this is never `identity`.
 */
export const IMPORT_DOCUMENT_KIND = 'synthetic' satisfies DocumentUploadRequest['kind']

/** Always read, so the server can match the document's name with the verified identity. */
export const NAME_ATTRIBUTE = 'full_name'

export function attributeName(attribute: string): string {
  return importAttributes.find((a) => a.attribute === attribute)?.name ?? attribute
}

/** The attributes of one category, in the order the screen lists them. */
export function attributesOf(category: AttributeCategory): readonly ImportAttribute[] {
  return importAttributes.filter((a) => a.category === category)
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
    if (upload.attributes.length > MAX_ATTRIBUTES_PER_IMPORT) return null
    return upload.attributes.every((a) => known.has(a)) ? upload : null
  } catch {
    return null
  }
}
