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
  /** getLogs calls in flight at once; the events are still folded in block order. Default 1. */
  concurrency?: number
  /** Called after each folded range with the share of the blocks read, from 0 to 1. */
  onProgress?: (done: number) => void
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
  const ranges: [bigint, bigint][] = []
  for (let from = index.toBlock + 1n; from <= head; from += step) {
    ranges.push([from, from + step - 1n < head ? from + step - 1n : head])
  }
  const concurrency = Math.max(1, Math.floor(config.concurrency ?? 1))
  // Fetched a batch at a time, folded in order: a revocation never comes before its anchor.
  for (let start = 0; start < ranges.length; start += concurrency) {
    const batch = ranges.slice(start, start + concurrency)
    const results = await Promise.all(
      batch.map(([fromBlock, toBlock]) =>
        config.client.getLogs({
          address: [config.issuerRegistry, config.attestationRegistry],
          events: registryEvents,
          fromBlock,
          toBlock,
          strict: true,
        }),
      ),
    )
    for (const [i, logs] of results.entries()) {
      fold(index, logs)
      index.toBlock = batch[i]?.[1] ?? index.toBlock
    }
    config.onProgress?.(Math.min(1, (start + batch.length) / ranges.length))
  }
  return index
}

type RegistryLog = Awaited<ReturnType<PublicClient['getLogs']>>[number] & {
  eventName: string
  args: Record<string, unknown>
}

function fold(index: RegistryIndex, logs: readonly unknown[]): void {
  for (const raw of logs as RegistryLog[]) {
    const args = raw.args as never as {
      issuerId: Hex
      admin: Address
      signer: Address
      metadataURI: string
      newSigner: Address
      attestationId: Hex
      commitment: Hex
      issuedAt: bigint
      expiresAt: bigint
      revokedAt: bigint
    }
    switch (raw.eventName) {
      case 'IssuerRegistered':
        index.issuers.set(args.issuerId, {
          admin: args.admin,
          signer: args.signer,
          metadataURI: args.metadataURI,
        })
        break
      case 'SignerRotated': {
        const issuer = index.issuers.get(args.issuerId)
        if (issuer) issuer.signer = args.newSigner
        break
      }
      case 'AttestationAnchored':
        index.attestations.set(args.attestationId, {
          issuerId: args.issuerId,
          signer: args.signer,
          commitment: args.commitment,
          issuedAt: args.issuedAt,
          expiresAt: args.expiresAt,
          revokedAt: 0n,
        })
        break
      case 'AttestationRevoked': {
        const attestation = index.attestations.get(args.attestationId)
        if (attestation) attestation.revokedAt = args.revokedAt
        break
      }
    }
  }
}
