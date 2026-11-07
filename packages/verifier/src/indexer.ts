import { parseAbi, type Address, type Hex, type PublicClient } from 'viem'

export const registryEvents = parseAbi([
  'event IssuerRegistered(bytes16 indexed issuerId, address indexed admin, address indexed signer, string metadataURI)',
  'event SignerRotated(bytes16 indexed issuerId, address indexed previousSigner, address indexed newSigner)',
  'event AttestationAnchored(bytes16 indexed attestationId, bytes16 indexed issuerId, address indexed signer, bytes32 commitment, uint64 issuedAt, uint64 expiresAt)',
  'event AttestationRevoked(bytes16 indexed attestationId, bytes16 indexed issuerId, uint64 revokedAt)',
])

export interface IndexedIssuer {
  admin: Address
  signer: Address
  metadataURI: string
}
export interface IndexedAttestation {
  issuerId: Hex
  signer: Address
  commitment: Hex
  issuedAt: bigint
  expiresAt: bigint
  revokedAt: bigint
}
/** What the registries emitted up to toBlock: for listing, never for a verdict (verify() reads the chain). */
export interface RegistryIndex {
  issuers: Map<Hex, IndexedIssuer>
  attestations: Map<Hex, IndexedAttestation>
  toBlock: bigint
}

export interface IndexerConfig {
  client: Pick<PublicClient, 'getLogs' | 'getBlockNumber'>
  issuerRegistry: Address
  attestationRegistry: Address
  /** The deployment block on a first run. */
  fromBlock: bigint
  /** Blocks per getLogs call: https://sepolia.base.org allows 200, some RPCs far more. */
  step?: bigint
}

/** Folds the registry events into an index; pass the previous index to catch up from where it stopped. */
export async function indexRegistries(
  config: IndexerConfig,
  previous?: RegistryIndex,
): Promise<RegistryIndex> {
  const index = previous ?? {
    issuers: new Map(),
    attestations: new Map(),
    toBlock: config.fromBlock - 1n,
  }
  // ponytail: indexes up to the latest block, no reorg handling; stop at a finalized block if a reorg ever matters.
  const head = await config.client.getBlockNumber()
  const step = config.step ?? 200n
  for (let from = index.toBlock + 1n; from <= head; from += step) {
    const to = from + step - 1n < head ? from + step - 1n : head
    const logs = await config.client.getLogs({
      address: [config.issuerRegistry, config.attestationRegistry],
      events: registryEvents,
      fromBlock: from,
      toBlock: to,
      strict: true,
    })
    for (const log of logs) {
      switch (log.eventName) {
        case 'IssuerRegistered':
          index.issuers.set(log.args.issuerId, {
            admin: log.args.admin,
            signer: log.args.signer,
            metadataURI: log.args.metadataURI,
          })
          break
        case 'SignerRotated': {
          const issuer = index.issuers.get(log.args.issuerId)
          if (issuer) issuer.signer = log.args.newSigner
          break
        }
        case 'AttestationAnchored': {
          const { attestationId, ...anchor } = log.args
          index.attestations.set(attestationId, { ...anchor, revokedAt: 0n })
          break
        }
        case 'AttestationRevoked': {
          const attestation = index.attestations.get(log.args.attestationId)
          if (attestation) attestation.revokedAt = log.args.revokedAt
          break
        }
      }
    }
    index.toBlock = to
  }
  return index
}
