import extractedClaim from '../schemas/v1/ExtractedClaim.schema.json' with { type: 'json' }
import encryptedRecord from '../schemas/v1/EncryptedRecord.schema.json' with { type: 'json' }
import keyEnvelope from '../schemas/v1/KeyEnvelope.schema.json' with { type: 'json' }
import shareGrant from '../schemas/v1/ShareGrant.schema.json' with { type: 'json' }
import attestationRecord from '../schemas/v1/AttestationRecord.schema.json' with { type: 'json' }
import issuerRegistryEntry from '../schemas/v1/IssuerRegistryEntry.schema.json' with { type: 'json' }
import verificationRequest from '../schemas/v1/VerificationRequest.schema.json' with { type: 'json' }
import verificationResult from '../schemas/v1/VerificationResult.schema.json' with { type: 'json' }
import authSession from '../schemas/v1/AuthSession.schema.json' with { type: 'json' }
import documentUploadRequest from '../schemas/v1/DocumentUploadRequest.schema.json' with { type: 'json' }
import accessDecision from '../schemas/v1/AccessDecision.schema.json' with { type: 'json' }
import identityValidationReport from '../schemas/v1/IdentityValidationReport.schema.json' with { type: 'json' }
export const schemas = {
  ExtractedClaim: extractedClaim,
  EncryptedRecord: encryptedRecord,
  KeyEnvelope: keyEnvelope,
  ShareGrant: shareGrant,
  AttestationRecord: attestationRecord,
  IssuerRegistryEntry: issuerRegistryEntry,
  VerificationRequest: verificationRequest,
  VerificationResult: verificationResult,
  AuthSession: authSession,
  DocumentUploadRequest: documentUploadRequest,
  AccessDecision: accessDecision,
  IdentityValidationReport: identityValidationReport,
}
