const documents = [
  { file: 'demo-complete-record.txt', name: 'Complete record (text)' },
  { file: 'demo-student-certificate.txt', name: 'Student certificate (text)' },
  { file: 'demo-employment-certificate.txt', name: 'Employment certificate (text)' },
  { file: 'FAKE-signed-synthetic-certificate.pdf', name: 'Student certificate, signed (PDF)' },
  { file: 'FAKE-signed-employment-certificate.pdf', name: 'Employment certificate, signed (PDF)' },
]

/**
 * Documents to try the import with. They describe an invented person, so nothing real is read.
 * The text ones import anywhere; the signed PDFs are the ones that come back as class B, and
 * reading their text needs poppler on the server.
 */
export function DemoDocuments() {
  return (
    <div className="samples">
      <h3>No document at hand? Use one of these</h3>
      <ul>
        {documents.map((document) => (
          <li key={document.file}>
            <a href={`/demo/${document.file}`} download>
              {document.name}
            </a>
          </li>
        ))}
      </ul>
      <p className="hint">
        An invented person, not a real identity. Download one, then choose it below.
      </p>
    </div>
  )
}
