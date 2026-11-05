import extractedClaim from '../schemas/v1/ExtractedClaim.schema.json' with { type: 'json' }
import encryptedRecord from '../schemas/v1/EncryptedRecord.schema.json' with { type: 'json' }
import keyEnvelope from '../schemas/v1/KeyEnvelope.schema.json' with { type: 'json' }
import shareGrant from '../schemas/v1/ShareGrant.schema.json' with { type: 'json' }
export const schemas = {
  ExtractedClaim: extractedClaim,
  EncryptedRecord: encryptedRecord,
  KeyEnvelope: keyEnvelope,
  ShareGrant: shareGrant,
}
