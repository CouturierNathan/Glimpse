// Mid-term demo: an issuer signs an attestation, it is anchored, read back, checked, then revoked.
// Run: npm run demo -w contracts [-- --network baseSepolia]. KEEP=1 skips the revocation.
/* eslint-disable no-console -- a CLI demo: its printed steps are the output */
import assert from 'node:assert/strict'
import { network } from 'hardhat'
import { getAddress, verifyTypedData, type Address, type Hash } from 'viem'
import GlimpseModule from '../ignition/modules/Glimpse.ts'
import {
  attestationCommitment,
  attestationDomain,
  attestationTypes,
  randomBytes,
  type AttestationContent,
} from '../attestation.ts'

const STATUS = ['unknown', 'active', 'expired', 'revoked']

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
  holder: getAddress((process.env.HOLDER ?? issuer.account.address) as Address),
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

// Read back from chain and check it the way a requester would, without trusting this script.
const anchor = await attestationRegistry.read.getAnchor([content.attestationId])
const { signer } = await issuerRegistry.read.getIssuer([anchor.issuerId])
assert.equal(anchor.commitment, attestationCommitment(content), 'commitment matches content')
assert.equal(anchor.signer, signer, 'anchored by the issuer current signer')
assert.ok(
  await verifyTypedData({
    address: anchor.signer,
    domain,
    types: attestationTypes,
    primaryType: 'Attestation',
    message,
    signature,
  }),
  'issuer signature',
)
console.log(
  `Read back: ${STATUS[await attestationRegistry.read.statusOf([content.attestationId])]}`,
)

const iso = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString()
console.log(
  JSON.stringify(
    {
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
    },
    null,
    2,
  ),
)

if (process.env.KEEP !== '1') {
  await step('Attestation revoked', attestationRegistry.write.revoke([content.attestationId]))
  console.log(`Status: ${STATUS[await attestationRegistry.read.statusOf([content.attestationId])]}`)
}
