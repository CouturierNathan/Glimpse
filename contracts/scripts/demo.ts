// Mid-term demo (#20): an issuer signs an attestation, the holder's vault encrypts it, it is
// anchored, decrypted and checked by a requester from the chain alone (#17), then revoked.
// Run: npm run demo -w contracts [-- --network baseSepolia]. KEEP=1 skips the revocation.
/* eslint-disable no-console -- a CLI demo: its printed steps are the output */
import assert from 'node:assert/strict'
import { network } from 'hardhat'
import { getAddress, type Address, type Hash } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { parseContract, type ExtractedClaim } from '@glimpse/shared'
import { decryptItem, encryptItem, generateEncryptionKeys, generateOpaqueId } from '@glimpse/vault'
import GlimpseModule from '../ignition/modules/Glimpse.ts'
import {
  attestationCommitment,
  attestationDomain,
  attestationTypes,
  randomBytes,
  requestDomain,
  requestMessage,
  requestTypes,
  verify,
  type AttestationContent,
} from '@glimpse/verifier'

const { viem, ignition } = await network.getOrCreate()
const publicClient = await viem.getPublicClient()
const [issuer] = await viem.getWalletClients()
const chainId = await publicClient.getChainId()
const explorer = chainId === 84532 ? 'https://sepolia.basescan.org/tx/' : undefined

async function step(label: string, send: Promise<Hash>) {
  const hash = await send
  await publicClient.waitForTransactionReceipt({ hash })
  console.log(`${label}: ${explorer ? explorer + hash : hash}`)
}

const { issuerRegistry, attestationRegistry } = await ignition.deploy(GlimpseModule)
console.log(`IssuerRegistry ${issuerRegistry.address}`)
console.log(`AttestationRegistry ${attestationRegistry.address}`)

const issuerId = randomBytes(16)
await step(
  'Issuer registered',
  issuerRegistry.write.register([
    issuerId,
    issuer.account.address,
    'data:application/json,{"name":"Glimpse demo school (test issuer)"}',
  ]),
)

const content: AttestationContent = {
  salt: randomBytes(32),
  attestationId: randomBytes(16),
  // The holder signs nothing here, so a fresh address stands in for their wallet.
  holder: getAddress(
    (process.env.HOLDER ?? privateKeyToAccount(generatePrivateKey()).address) as Address,
  ),
  attribute: 'student_status',
  value: { type: 'boolean', value: true },
}
const now = (await publicClient.getBlock()).timestamp
const message = {
  attestationId: content.attestationId,
  issuerId,
  commitment: attestationCommitment(content),
  issuedAt: now,
  expiresAt: now + 180n * 24n * 3600n,
}
const domain = attestationDomain(chainId, attestationRegistry.address)
const signature = await issuer.signTypedData({
  account: issuer.account,
  domain,
  types: attestationTypes,
  primaryType: 'Attestation',
  message,
})
const iso = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString()
const record = parseContract('AttestationRecord', {
  schemaVersion: '1.0.0',
  attestationId: content.attestationId.slice(2),
  issuerId: issuerId.slice(2),
  holder: content.holder,
  attribute: content.attribute,
  value: content.value,
  issuedAt: iso(message.issuedAt),
  expiresAt: iso(message.expiresAt),
  salt: content.salt,
  commitment: message.commitment,
  proof: { type: 'EIP712', chainId, verifyingContract: domain.verifyingContract, signature },
})
console.log('Attestation signed by the issuer (EIP-712)')

// B's vault encrypts claims, so the class C claim is what gets encrypted; the record's salt and
// proof stay in the holder's client memory in this demo.
const holderKeys = await generateEncryptionKeys(generateOpaqueId())
const claim: ExtractedClaim = {
  schemaVersion: '1.0.0',
  claimId: generateOpaqueId(),
  attribute: record.attribute,
  value: record.value,
  period: { start: record.issuedAt.slice(0, 10), end: record.expiresAt.slice(0, 10) },
  document: {
    documentId: record.attestationId,
    documentVersion: 1,
    provenance: { class: 'C', attestationId: record.attestationId, issuerId: record.issuerId },
  },
  pages: [1],
  confidence: 1,
}
const item = { itemId: generateOpaqueId(), itemVersion: 1, grantId: generateOpaqueId() }
const vault = await encryptItem(claim, claim.document, holderKeys, item)
console.log(
  `Encrypted in the holder's vault: AES-256-GCM item, RSA-OAEP-256 key envelope (${vault.record.ciphertext.length} base64url chars)`,
)

await step(
  'Attestation anchored',
  attestationRegistry.write.anchor([
    message.attestationId,
    message.issuerId,
    message.commitment,
    message.issuedAt,
    message.expiresAt,
    signature,
  ]),
)

const opened = await decryptItem(vault.record, vault.envelope, holderKeys, {
  ...item,
  keyId: vault.record.keyId,
  sourceClass: 'C',
})
console.log(`Decrypted from the vault: ${opened.attribute} = ${JSON.stringify(opened.value.value)}`)
const shared = { ...record, attribute: opened.attribute, value: opened.value }
console.log(JSON.stringify(shared, null, 2))

// A requester signs a request and checks the shared record with @glimpse/verifier, which reads
// only the chain.
const requester = privateKeyToAccount(generatePrivateKey())
const answered = new Set<string>()
async function requesterVerifies() {
  // The chain's clock: a local node runs a few seconds ahead of the wall clock.
  const at = new Date(Number((await publicClient.getBlock()).timestamp) * 1000)
  const fields = {
    requestId: generateOpaqueId(),
    requester: requester.address,
    attribute: content.attribute,
    purpose: 'Student discount (mid-term demo)',
    recipientId: generateOpaqueId(),
    recipientKeyId: generateOpaqueId(),
    createdAt: at.toISOString(),
    expiresAt: new Date(at.getTime() + 15 * 60_000).toISOString(),
  }
  const proof = {
    type: 'EIP712',
    chainId,
    signature: await requester.signTypedData({
      domain: requestDomain(chainId),
      types: requestTypes,
      primaryType: 'VerificationRequest',
      message: requestMessage(fields),
    }),
  }
  const result = await verify({ schemaVersion: '1.0.0', ...fields, proof }, shared, {
    client: publicClient,
    chainId,
    attestationRegistry: attestationRegistry.address,
    trustedIssuers: [record.issuerId],
    answered,
    now: () => at,
  })
  const checks = Object.entries(result.checks).map(([name, outcome]) => `${name} ${outcome}`)
  console.log(`Requester verdict: ${result.verdict} (${checks.join(', ')})`)
  return result.verdict
}
assert.equal(await requesterVerifies(), 'authentic')

if (process.env.KEEP !== '1') {
  await step('Attestation revoked', attestationRegistry.write.revoke([content.attestationId]))
  assert.equal(await requesterVerifies(), 'revoked')
}
