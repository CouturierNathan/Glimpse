import { indexRegistries, type RegistryIndex } from '@glimpse/verifier'
import { createPublicClient, http } from 'viem'

import {
  appChain,
  attestationRegistry,
  INDEX_STEP,
  indexRpc,
  issuerRegistry,
  registriesDeployedAt,
} from '@/lib/chains.ts'
import { decodeRegistryIndex, encodeRegistryIndex, REGISTRY_KEY } from '@/lib/registry-cache.ts'
import { state } from '@/lib/vault/server.ts'

/** The first read of a fresh store pages through the whole deployment: allow it the time. */
export const maxDuration = 60

const client = createPublicClient({ chain: appChain, transport: http(indexRpc) })
const shared = globalThis as { glimpseRegistryIndexing?: Promise<RegistryIndex> }

/**
 * A starting point for the issuer screen: the registry events this server already read, caught up
 * to now and kept in the state store, so no visitor pages through the whole chain history. It is
 * public chain data, a listing aid only: the browser reads the blocks after it itself, and every
 * verdict comes from verify() against the chain.
 */
export async function GET() {
  try {
    shared.glimpseRegistryIndexing ??= (async () => {
      const kv = await state()
      const cached = await kv.get(REGISTRY_KEY)
      const previous = cached ? (decodeRegistryIndex(cached) ?? undefined) : undefined
      const next = await indexRegistries(
        {
          client,
          issuerRegistry,
          attestationRegistry,
          fromBlock: registriesDeployedAt,
          step: INDEX_STEP,
          concurrency: 8,
        },
        previous,
      )
      await kv.set(REGISTRY_KEY, encodeRegistryIndex(next))
      return next
    })().finally(() => {
      shared.glimpseRegistryIndexing = undefined
    })
    const index = await shared.glimpseRegistryIndexing
    return new Response(encodeRegistryIndex(index), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch {
    return Response.json(
      { error: 'The registries could not be read from the chain.' },
      { status: 503 },
    )
  }
}
